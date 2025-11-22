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
            exclude: [],
            sources: nil,
            resources: [
                .process("Resources/Sounds")
            ],
            publicHeadersPath: nil,
            cSettings: [
                .headerSearchPath("../CMacOSSensing/include")
            ],
            cxxSettings: nil,
            swiftSettings: nil,
            linkerSettings: [
                .linkedFramework("Cocoa"),
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("Vision"),
                .linkedFramework("AVFoundation")
            ]
        )
    ]
)
