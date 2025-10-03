import AppKit

enum StatusIconFactory {
    static func render(
        symbolName: String,
        tint: NSColor,
        gradientTop: NSColor,
        gradientBottom: NSColor,
        diameter: CGFloat = 18,
        scale: CGFloat = NSScreen.main?.backingScaleFactor ?? 2.0
    ) -> NSImage {
        // Clean SF Symbol (no outline/glow)
        let pointSize = max(13, diameter)
        let config = NSImage.SymbolConfiguration(pointSize: pointSize, weight: .semibold)
        if let base = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil)?.withSymbolConfiguration(config) {
            let tinted = base.tinting(with: tint)
            tinted.isTemplate = false
            return tinted
        }
        return NSImage(size: NSSize(width: diameter * scale, height: diameter * scale))
    }

    static func renderPingBadge(
        dotColor: NSColor,
        text: String,
        diameter: CGFloat = 18,
        scale: CGFloat = NSScreen.main?.backingScaleFactor ?? 2.0
    ) -> NSImage {
        // Use same vertical metrics as the two-line badge so items align
        let topFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        let bottomFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        let bottomAttr = NSAttributedString(string: text, attributes: [
            .font: bottomFont,
            .foregroundColor: NSColor.labelColor
        ])
        // Measure heights
        let topHeight = NSAttributedString(string: "00", attributes: [.font: topFont]).size().height
        let bottomSize = bottomAttr.size()
        let bottomHeight = bottomSize.height

        let width = max(diameter, ceil(bottomSize.width))
        let height = ceil(topHeight + bottomHeight)
        let size = NSSize(width: width, height: height)
        let image = NSImage(size: size)
        image.lockFocus()

        // Dot centered vertically within the top line area
        let dotDiameter: CGFloat = 10
        let centerY = bottomHeight + (topHeight / 2)
        let dotRect = NSRect(
            x: (width - dotDiameter) / 2,
            y: round(centerY - dotDiameter / 2),
            width: dotDiameter,
            height: dotDiameter
        )
        let dotPath = NSBezierPath(ovalIn: dotRect)
        (dotColor.usingColorSpace(.deviceRGB) ?? dotColor).setFill()
        dotPath.fill()

        // Bottom text baseline at y = 0
        let textOrigin = NSPoint(
            x: round((width - bottomSize.width) / 2),
            y: 0
        )
        bottomAttr.draw(at: textOrigin)

        image.unlockFocus()
        image.isTemplate = false
        return image
    }

    static func renderTwoLineBadge(
        topText: String,
        bottomText: String,
        diameter: CGFloat = 18
    ) -> NSImage {
        let topFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        let bottomFont = NSFont.monospacedDigitSystemFont(ofSize: 11, weight: .semibold)
        let topAttr = NSAttributedString(string: topText, attributes: [.font: topFont, .foregroundColor: NSColor.labelColor])
        let bottomAttr = NSAttributedString(string: bottomText, attributes: [.font: bottomFont, .foregroundColor: NSColor.labelColor])
        let topSize = topAttr.size()
        let bottomSize = bottomAttr.size()
        let width = max(diameter, ceil(max(topSize.width, bottomSize.width)))
        let height = ceil(topSize.height + bottomSize.height)
        let image = NSImage(size: NSSize(width: width, height: height))
        image.lockFocus()
        let topOrigin = NSPoint(x: round((width - topSize.width) / 2), y: height - topSize.height)
        topAttr.draw(at: topOrigin)
        let bottomOrigin = NSPoint(x: round((width - bottomSize.width) / 2), y: 0)
        bottomAttr.draw(at: bottomOrigin)
        image.unlockFocus()
        image.isTemplate = false
        return image
    }
    
    static func renderWSIcon(
        diameter: CGFloat = 18,
        scale: CGFloat = NSScreen.main?.backingScaleFactor ?? 2.0
    ) -> NSImage {
        // Load the WS logo from the app bundle
        guard let logoPath = Bundle.main.path(forResource: "logo", ofType: "png"),
              let logoImage = NSImage(contentsOfFile: logoPath) else {
            // Fallback to game controller if logo not found
            return render(symbolName: "gamecontroller.circle.fill", tint: .systemBlue, gradientTop: .clear, gradientBottom: .clear, diameter: diameter)
        }
        
        // Resize the logo to fit the menu bar icon size
        let targetSize = NSSize(width: diameter * scale, height: diameter * scale)
        let resizedImage = NSImage(size: targetSize)
        resizedImage.lockFocus()
        
        // Draw the logo scaled to fit
        let sourceRect = NSRect(origin: .zero, size: logoImage.size)
        let destRect = NSRect(origin: .zero, size: targetSize)
        logoImage.draw(in: destRect, from: sourceRect, operation: .sourceOver, fraction: 1.0)
        
        resizedImage.unlockFocus()
        resizedImage.isTemplate = false
        return resizedImage
    }
}

private extension NSImage {
    func tinting(with color: NSColor) -> NSImage {
        let result = NSImage(size: size)
        result.lockFocus()
        let rect = NSRect(origin: .zero, size: size)
        draw(in: rect)
        color.set()
        rect.fill(using: .sourceAtop)
        result.unlockFocus()
        result.isTemplate = false
        return result
    }
}


