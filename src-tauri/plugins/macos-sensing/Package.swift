// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MacOSSensing",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "MacOSSensing",
            type: .dynamic,
            targets: ["MacOSSensing"]
        )
    ],
    targets: [
        .target(
            name: "MacOSSensing",
            path: "Sources/MacOSSensing",
            linkerSettings: [
                .linkedFramework("Cocoa"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Vision")
            ]
        )
    ]
)
