import Foundation

@_cdecl("get_active_window_metadata_ffi")
public func getActiveWindowMetadataFFI() -> UnsafeMutablePointer<WindowMetadataFFI>? {
    var metadata: WindowMetadataFFI?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            metadata = try await MacOSSensingPlugin.shared.getActiveWindowMetadata()
        } catch {
            metadata = nil
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        return nil
    }

    guard let result = metadata else {
        return nil
    }

    let pointer = UnsafeMutablePointer<WindowMetadataFFI>.allocate(capacity: 1)
    pointer.pointee = result
    return pointer
}

@_cdecl("capture_screenshot_ffi")
public func captureScreenshotFFI(
    _ windowId: UInt32,
    _ outLength: UnsafeMutablePointer<Int>
) -> UnsafeMutablePointer<UInt8>? {
    var data: Data?
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            data = try await MacOSSensingPlugin.shared.captureScreenshot(windowId: windowId)
        } catch {
            data = nil
            print("Screenshot capture error: \(error)")
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        outLength.pointee = 0
        return nil
    }

    guard let bufferData = data else {
        outLength.pointee = 0
        return nil
    }

    outLength.pointee = bufferData.count
    let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferData.count)
    bufferData.copyBytes(to: buffer, count: bufferData.count)
    return buffer
}

@_cdecl("run_ocr_ffi")
public func runOCRFFI(
    _ imageData: UnsafePointer<UInt8>,
    _ imageLength: Int
) -> UnsafeMutablePointer<OCRResultFFI>? {
    let bytes = Data(bytes: imageData, count: imageLength)
    let resultPointer = UnsafeMutablePointer<OCRResultFFI>.allocate(capacity: 1)
    let semaphore = DispatchSemaphore(value: 0)

    Task.detached(priority: .userInitiated) {
        defer { semaphore.signal() }
        do {
            let ocrResult = try await MacOSSensingPlugin.shared.runOCR(imageData: bytes)
            resultPointer.pointee = ocrResult
        } catch {
            print("OCR error: \(error)")
            resultPointer.pointee = OCRResultFFI(
                textPtr: strdup(""),
                confidence: 0.0,
                wordCount: 0
            )
        }
    }

    if semaphore.wait(timeout: .now() + 5) == .timedOut {
        resultPointer.pointee = OCRResultFFI(
            textPtr: strdup(""),
            confidence: 0.0,
            wordCount: 0
        )
    }

    return resultPointer
}

@_cdecl("free_window_metadata_ffi")
public func freeWindowMetadataFFI(_ pointer: UnsafeMutablePointer<WindowMetadataFFI>) {
    if let bundleId = pointer.pointee.bundleIdPtr {
        free(bundleId)
    }
    if let title = pointer.pointee.titlePtr {
        free(title)
    }
    if let owner = pointer.pointee.ownerNamePtr {
        free(owner)
    }
    pointer.deallocate()
}

@_cdecl("free_screenshot_buffer_ffi")
public func freeScreenshotBufferFFI(_ pointer: UnsafeMutablePointer<UInt8>) {
    pointer.deallocate()
}

@_cdecl("free_ocr_result_ffi")
public func freeOCRResultFFI(_ pointer: UnsafeMutablePointer<OCRResultFFI>) {
    if let text = pointer.pointee.textPtr {
        free(text)
    }
    pointer.deallocate()
}
