#!/bin/bash
set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/Pomodoro.app"

# Extract version from tauri.conf.json so paths stay correct across releases
APP_VERSION=$(python3 -c "import json; print(json.load(open('$PROJECT_ROOT/src-tauri/tauri.conf.json'))['version'])")
echo "Detected app version: $APP_VERSION"

DMG_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg/pomodoro_${APP_VERSION}_aarch64.dmg"
# Original location where Tauri puts the sidecar/resource
RESOURCE_DYLIB_PATH="$APP_PATH/Contents/Resources/resources/libMacOSSensing.dylib"
ADAPTER_RESOURCE_DYLIB_PATH="$APP_PATH/Contents/Resources/resources/libMediaRemoteAdapter.dylib"
# New standard location we will move it to
FRAMEWORKS_DIR="$APP_PATH/Contents/Frameworks"
FINAL_DYLIB_PATH="$FRAMEWORKS_DIR/libMacOSSensing.dylib"
FINAL_ADAPTER_DYLIB_PATH="$FRAMEWORKS_DIR/libMediaRemoteAdapter.dylib"
AUTH_KEY="${APPLE_API_KEY_PATH:-$PROJECT_ROOT/AuthKey_AD89R6TC2D.p8}"

# Identity Info
SIGN_IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Morteza Faraji (W746XP6N3P)}"
KEY_ID="${APPLE_API_KEY:-AD89R6TC2D}"
ISSUER_ID="${APPLE_API_ISSUER:-d336d562-9b00-434b-afc4-4ea45e3ee6c5}"
RELEASE_REPOSITORY="${RELEASE_REPOSITORY:-steventanyang/lefocus}"
RELEASE_TAG="${RELEASE_TAG:-v${APP_VERSION}}"

if [ ! -f "$AUTH_KEY" ]; then
    echo "Error: Apple notarization key not found at $AUTH_KEY"
    echo "Set APPLE_API_KEY_PATH to the .p8 key path."
    exit 1
fi

echo "----------------------------------------------------------------"
echo "Step 0: Fix Bundle Structure & Linking"
echo "----------------------------------------------------------------"
# 1. Create Frameworks directory
mkdir -p "$FRAMEWORKS_DIR"

if [ -f "$ADAPTER_RESOURCE_DYLIB_PATH" ]; then
    echo "Moving MediaRemote adapter dylib from Resources to Frameworks..."
    mv "$ADAPTER_RESOURCE_DYLIB_PATH" "$FINAL_ADAPTER_DYLIB_PATH"
elif [ -f "$FINAL_ADAPTER_DYLIB_PATH" ]; then
    echo "Found MediaRemote adapter dylib already in Frameworks."
else
    echo "Error: Could not find libMediaRemoteAdapter.dylib in Resources or Frameworks."
    exit 1
fi

# 2. Move the dylib if it exists in Resources
if [ -f "$RESOURCE_DYLIB_PATH" ]; then
    echo "Moving dylib from Resources to Frameworks..."
    mv "$RESOURCE_DYLIB_PATH" "$FINAL_DYLIB_PATH"
else
    echo "Warning: Dylib not found in Resources at $RESOURCE_DYLIB_PATH"
    # Check if it's already in Frameworks (re-run case)
    if [ -f "$FINAL_DYLIB_PATH" ]; then
        echo "Found dylib already in Frameworks."
    else
        echo "Error: Could not find libMacOSSensing.dylib in Resources or Frameworks."
        exit 1
    fi
fi

# 3. Fix the dylib's internal install name
# This ensures the dylib knows it can be loaded via @rpath
echo "Fixing dylib install name..."
install_name_tool -id "@rpath/libMacOSSensing.dylib" "$FINAL_DYLIB_PATH"
install_name_tool -id "@rpath/libMediaRemoteAdapter.dylib" "$FINAL_ADAPTER_DYLIB_PATH"

echo "----------------------------------------------------------------"
echo "Step 1: Sign nested binaries (from inside out)"
echo "----------------------------------------------------------------"
echo "Signing adapter dylib: $FINAL_ADAPTER_DYLIB_PATH"
codesign --force --options runtime --timestamp \
    --sign "$SIGN_IDENTITY" \
    "$FINAL_ADAPTER_DYLIB_PATH"

if [ -f "$FINAL_DYLIB_PATH" ]; then
    echo "Signing dylib: $FINAL_DYLIB_PATH"
    codesign --force --options runtime --timestamp \
        --sign "$SIGN_IDENTITY" \
        "$FINAL_DYLIB_PATH"
else
    echo "Error: Dylib missing at $FINAL_DYLIB_PATH"
    exit 1
fi

echo "----------------------------------------------------------------"
echo "Step 2: Sign the main Application Bundle"
echo "----------------------------------------------------------------"
echo "Signing app: $APP_PATH"
ENTITLEMENTS_PATH="$PROJECT_ROOT/src-tauri/entitlements.plist"
# Using --deep implies recursive signing, but since we manually signed the dylib, 
# this ensures the main bundle covers everything.
# The --entitlements flag is REQUIRED for automation permissions (Spotify control)
codesign --deep --force --options runtime --timestamp \
    --entitlements "$ENTITLEMENTS_PATH" \
    --sign "$SIGN_IDENTITY" \
    "$APP_PATH"

echo "----------------------------------------------------------------"
echo "Step 3: Verify the signature"
echo "----------------------------------------------------------------"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
# Gatekeeper will reject the app at this stage because it is not yet notarized.
# We allow the script to proceed despite this rejection.
spctl --assess --type execute --verbose "$APP_PATH" || echo "⚠️  Note: spctl rejection is expected before notarization. Proceeding..."

echo "----------------------------------------------------------------"
echo "Step 4: Repack updater bundle + sign (must match Developer ID app above)"
echo "----------------------------------------------------------------"
# Tauri emits an updater archive from the unsigned bundle; replace it with an
# archive of this signed .app so in-app updates get the same identity as the DMG (TCC).
UPDATER_BUNDLE="$PROJECT_ROOT/src-tauri/target/release/bundle/macos/pomodoro.app.tar.gz"
UPDATER_SIG="${UPDATER_BUNDLE}.sig"
TAURI_KEY="${TAURI_SIGNING_PRIVATE_KEY:-${TAURI_PRIVATE_KEY:-}}"
TAURI_KEY_PASS="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-${TAURI_PRIVATE_KEY_PASSWORD:-}}"
if [ -z "$TAURI_KEY" ]; then
    echo "Error: Set TAURI_SIGNING_PRIVATE_KEY (or TAURI_PRIVATE_KEY) to minisign pomodoro.app.tar.gz."
    echo "Use the same key as tauri build (matches pubkey in tauri.conf.json)."
    exit 1
fi
echo "Creating $UPDATER_BUNDLE from signed $APP_PATH ..."
# COPYFILE_DISABLE=1: without this, BSD tar adds AppleDouble files (._Pomodoro.app)
# that the Tauri updater cannot unpack correctly.
COPYFILE_DISABLE=1 tar -czf "$UPDATER_BUNDLE" -C "$(dirname "$APP_PATH")" "$(basename "$APP_PATH")"
rm -f "$UPDATER_SIG"
if [ -f "$TAURI_KEY" ]; then
    TAURI_KEY_ARGS=(-f "$TAURI_KEY")
else
    TAURI_KEY_ARGS=(-k "$TAURI_KEY")
fi
if [ -n "$TAURI_KEY_PASS" ]; then
    (cd "$PROJECT_ROOT" && bun run tauri signer sign "${TAURI_KEY_ARGS[@]}" -p "$TAURI_KEY_PASS" "$UPDATER_BUNDLE")
else
    (cd "$PROJECT_ROOT" && bun run tauri signer sign "${TAURI_KEY_ARGS[@]}" "$UPDATER_BUNDLE")
fi
echo "Updater bundle signed: $UPDATER_SIG"

echo "----------------------------------------------------------------"
echo "Step 5: Rebuild the DMG (Required to include the new signature)"
echo "----------------------------------------------------------------"
# Remove old DMG
rm -f "$DMG_PATH"
# Stage only the .app — bundle/macos/ also holds the updater archive and signature.
# Packing that whole directory would show those files in the DMG window.
DMG_CONTENTS_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg_contents"
rm -rf "$DMG_CONTENTS_DIR"
mkdir -p "$DMG_CONTENTS_DIR"
ditto "$APP_PATH" "$DMG_CONTENTS_DIR/Pomodoro.app"

# Create new DMG using the bundled script
echo "Creating DMG at $DMG_PATH using bundle_dmg.sh..."
BUNDLE_DMG_SCRIPT="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg/bundle_dmg.sh"
ICON_PATH="$PROJECT_ROOT/src-tauri/target/release/bundle/dmg/icon.icns"

"$BUNDLE_DMG_SCRIPT" \
  --volname "Pomodoro" \
  --volicon "$ICON_PATH" \
  --window-size 600 400 \
  --icon-size 100 \
  --icon "Pomodoro.app" 175 190 \
  --hide-extension "Pomodoro.app" \
  --app-drop-link 425 190 \
  "$DMG_PATH" \
  "$DMG_CONTENTS_DIR"

echo "----------------------------------------------------------------"
echo "Step 6: Submit DMG for Notarization"
echo "----------------------------------------------------------------"
echo "Submitting to Apple Notary Service..."

# Ensure logs directory exists
mkdir -p "$PROJECT_ROOT/logs"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$PROJECT_ROOT/logs/notarization_$TIMESTAMP.log"

# Start capturing the log
echo "Notarization output is being saved to: $LOG_FILE"
echo "You can follow it in another terminal with: tail -f $LOG_FILE"

# Run notarytool WITHOUT --wait to avoid indefinite hanging
# Submit and get the submission ID immediately
echo "Submitting DMG (this may take a few minutes to upload)..."
set +e
SUBMISSION_OUTPUT=$(xcrun notarytool submit "$DMG_PATH" \
    --key "$AUTH_KEY" \
    --key-id "$KEY_ID" \
    --issuer "$ISSUER_ID" 2>&1 | tee -a "$LOG_FILE")
SUBMISSION_STATUS=$?
set -e

if [ "$SUBMISSION_STATUS" -ne 0 ]; then
    echo "ERROR: Apple notarization submission failed:" | tee -a "$LOG_FILE"
    echo "$SUBMISSION_OUTPUT" | tee -a "$LOG_FILE"
    exit "$SUBMISSION_STATUS"
fi

# Extract Submission ID from the output
SUBMISSION_ID=$(echo "$SUBMISSION_OUTPUT" | grep -E "id: [a-f0-9-]+" | head -n 1 | awk '{print $2}')

if [ -z "$SUBMISSION_ID" ]; then
    echo "ERROR: Could not extract Submission ID from output." | tee -a "$LOG_FILE"
    echo "Full output:" | tee -a "$LOG_FILE"
    echo "$SUBMISSION_OUTPUT" | tee -a "$LOG_FILE"
    exit 1
fi

echo "Submission ID: $SUBMISSION_ID" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "⚠️  IMPORTANT: Notarization is now processing in the background." | tee -a "$LOG_FILE"
echo "⚠️  Do NOT wait here - check status later with:" | tee -a "$LOG_FILE"
echo "   xcrun notarytool log $SUBMISSION_ID --key $AUTH_KEY --key-id $KEY_ID --issuer $ISSUER_ID" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"
echo "To check status, run:" | tee -a "$LOG_FILE"
echo "   xcrun notarytool history --key $AUTH_KEY --key-id $KEY_ID --issuer $ISSUER_ID" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# Poll for completion (up to 15 minutes)
MAX_ATTEMPTS=30
POLL_INTERVAL=30
ATTEMPT=1

echo "Polling for notarization status (max ${MAX_ATTEMPTS} attempts, ${POLL_INTERVAL}s interval)..." | tee -a "$LOG_FILE"

while [ $ATTEMPT -le $MAX_ATTEMPTS ]; do
    sleep $POLL_INTERVAL
    
    STATUS=$(xcrun notarytool history --key "$AUTH_KEY" --key-id "$KEY_ID" --issuer "$ISSUER_ID" 2>&1 | grep -A 5 "$SUBMISSION_ID" | grep "status:" | awk '{print $2}')
    
    echo "[$ATTEMPT/$MAX_ATTEMPTS] Status: $STATUS" | tee -a "$LOG_FILE"
    
    if [ "$STATUS" = "Accepted" ]; then
        echo "✅ Notarization accepted! Proceeding to staple..." | tee -a "$LOG_FILE"
        break
    elif [ "$STATUS" = "Invalid" ] || [ "$STATUS" = "Rejected" ]; then
        echo "❌ Notarization failed with status: $STATUS" | tee -a "$LOG_FILE"
        echo "Fetching detailed log..." | tee -a "$LOG_FILE"
        xcrun notarytool log "$SUBMISSION_ID" \
            --key "$AUTH_KEY" \
            --key-id "$KEY_ID" \
            --issuer "$ISSUER_ID" 2>&1 | tee -a "$LOG_FILE"
        exit 1
    fi
    
    ATTEMPT=$((ATTEMPT + 1))
done

if [ "$STATUS" != "Accepted" ]; then
    echo "⚠️  Timed out after 15 minutes. Check status manually with:" | tee -a "$LOG_FILE"
    echo "   xcrun notarytool history --key $AUTH_KEY --key-id $KEY_ID --issuer $ISSUER_ID" | tee -a "$LOG_FILE"
    exit 1
fi

echo ""
echo "----------------------------------------------------------------"
echo "Step 7: Retrieve Notarization Log"
echo "----------------------------------------------------------------"
if [ -n "$SUBMISSION_ID" ]; then
    echo "Fetching full log for Submission ID: $SUBMISSION_ID"
    # Append the Apple server result log to our local log file
    xcrun notarytool log "$SUBMISSION_ID" \
        --key "$AUTH_KEY" \
        --key-id "$KEY_ID" \
        --issuer "$ISSUER_ID" 2>&1 | tee -a "$LOG_FILE"
else
    echo "Could not determine Submission ID from output." | tee -a "$LOG_FILE"
fi

echo "----------------------------------------------------------------"
echo "Step 8: Staple the ticket"
echo "----------------------------------------------------------------"
xcrun stapler staple "$DMG_PATH"

echo "----------------------------------------------------------------"
echo "Step 9: Generate latest.json (for Tauri updater)"
echo "----------------------------------------------------------------"
LATEST_JSON="$PROJECT_ROOT/src-tauri/target/release/bundle/latest.json"

if [ ! -f "$UPDATER_BUNDLE" ]; then
    echo "Error: Updater bundle missing at $UPDATER_BUNDLE (Step 4 should have created it)."
    exit 1
fi

if [ ! -f "$UPDATER_SIG" ]; then
    echo "Error: Signature file missing at $UPDATER_SIG (Step 4 should have created it)."
    exit 1
fi

SIGNATURE=$(cat "$UPDATER_SIG")
DOWNLOAD_URL="https://github.com/${RELEASE_REPOSITORY}/releases/download/${RELEASE_TAG}/pomodoro.app.tar.gz"

cat > "$LATEST_JSON" <<EOF
{
  "version": "$APP_VERSION",
  "platforms": {
    "darwin-aarch64": {
      "url": "$DOWNLOAD_URL",
      "signature": "$SIGNATURE"
    }
  }
}
EOF

echo "Generated $LATEST_JSON"
echo "  version: $APP_VERSION"
echo "  url: $DOWNLOAD_URL"

echo "----------------------------------------------------------------"
echo "Step 10: Verify the Notarized DMG"
echo "----------------------------------------------------------------"
spctl --assess --type install --verbose "$DMG_PATH" || echo "Warning: DMG verification failed."
echo "----------------------------------------------------------------"
echo "Done! Upload these files to GitHub Release ${RELEASE_TAG}:"
echo "  1. $DMG_PATH (website download)"
echo "  2. $UPDATER_BUNDLE (in-app updater)"
echo "  3. $LATEST_JSON (updater metadata)"
echo "----------------------------------------------------------------"
