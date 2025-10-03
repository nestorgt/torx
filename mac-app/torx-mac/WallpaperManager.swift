import AppKit

final class WallpaperManager {
    static let shared = WallpaperManager()

    private let appFolder: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = base.appendingPathComponent("TorxWall", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    func setColor(_ color: NSColor) {
        let path = urlFor(color: color)
        if !FileManager.default.fileExists(atPath: path.path), let data = Self.pngData(of: color) {
            try? data.write(to: path, options: .atomic)
        }
        for screen in NSScreen.screens {
            do {
                try NSWorkspace.shared.setDesktopImageURL(path, for: screen, options: [:])
            } catch {
                NSLog("Failed to set wallpaper: \(error.localizedDescription)")
            }
        }
    }

    func prewarm(colors: [NSColor]) {
        for c in colors {
            let url = urlFor(color: c)
            if !FileManager.default.fileExists(atPath: url.path), let data = Self.pngData(of: c) {
                try? data.write(to: url, options: .atomic)
            }
        }
    }

    private func urlFor(color: NSColor) -> URL {
        let hex = color.usingColorSpace(.deviceRGB)?.hexString ?? "000000"
        return appFolder.appendingPathComponent("solid_\(hex).png")
    }

    private static func pngData(of color: NSColor, size: CGSize = CGSize(width: 512, height: 512)) -> Data? {
        let img = NSImage(size: size)
        img.lockFocus()
        (color.usingColorSpace(.deviceRGB) ?? color).setFill()
        NSRect(origin: .zero, size: size).fill()
        img.unlockFocus()
        guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
        return rep.representation(using: .png, properties: [:])
    }
}

private extension NSColor {
    var hexString: String {
        let c = usingColorSpace(.deviceRGB) ?? self
        let r = Int(round(c.redComponent * 255))
        let g = Int(round(c.greenComponent * 255))
        let b = Int(round(c.blueComponent * 255))
        return String(format: "%02X%02X%02X", r, g, b)
    }
}


