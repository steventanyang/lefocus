/** True when the Mac .dmg should be offered (desktop / laptop browsers, not phones or iPad). */
export function shouldOfferMacDownload(): boolean {
  if (typeof navigator === "undefined") return true;
  const ua = navigator.userAgent;
  if (
    /iPhone|iPod|Android.*Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      ua
    )
  ) {
    return false;
  }
  if (/iPad/i.test(ua)) return false;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return false;
  }
  return true;
}
