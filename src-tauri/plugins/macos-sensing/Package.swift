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
            name: "CMacOSSensing",
            path: "Sources/CMacOSSensing",
            publicHeadersPath: "include"
        ),
        .target(
            name: "MacOSSensing",
            dependencies: ["CMacOSSensing"],
            path: "Sources/MacOSSensing",
            cSettings: [
                .headerSearchPath("../CMacOSSensing/include")
            ],
            linkerSettings: [
                .linkedFramework("Cocoa"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Vision")
            ]
        )
    ]
)
