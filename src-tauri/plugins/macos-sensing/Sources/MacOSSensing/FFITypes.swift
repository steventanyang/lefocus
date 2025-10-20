import Foundation

public struct WindowMetadataFFI {
    public var windowId: UInt32
    public var bundleIdPtr: UnsafeMutablePointer<CChar>?
    public var titlePtr: UnsafeMutablePointer<CChar>?
    public var ownerNamePtr: UnsafeMutablePointer<CChar>?
    public var boundsX: Double
    public var boundsY: Double
    public var boundsWidth: Double
    public var boundsHeight: Double
}

public struct OCRResultFFI {
    public var textPtr: UnsafeMutablePointer<CChar>?
    public var confidence: Double
    public var wordCount: Int64
}
