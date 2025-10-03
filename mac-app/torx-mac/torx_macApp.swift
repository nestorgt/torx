//
//  torx_macApp.swift
//  torx-mac
//
//  Created by Nestor on 21/8/25.
//

import SwiftUI
import AppKit

@main
struct TorxApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene {
        Settings { EmptyView() }
    }
}
