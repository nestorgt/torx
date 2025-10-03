import AppKit

final class DailyScheduler {
    static let shared = DailyScheduler()
    private var timer: Timer?
    private var hour: Int = 23
    private var minute: Int = 0
    private var action: (() -> Void)?

    func scheduleDaily(at hour: Int, minute: Int = 0, action: @escaping () -> Void) {
        self.hour = hour
        self.minute = minute
        self.action = action
        scheduleNext()
    }

    private func scheduleNext() {
        timer?.invalidate()
        let now = Date()
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: now)
        comps.hour = hour
        comps.minute = minute
        let target = Calendar.current.date(from: comps) ?? now
        let next = target > now ? target : Calendar.current.date(byAdding: .day, value: 1, to: target) ?? now.addingTimeInterval(24*3600)
        let interval = max(1, next.timeIntervalSinceNow)
        timer = Timer.scheduledTimer(withTimeInterval: interval, repeats: false) { [weak self] _ in
            guard let self else { return }
            self.action?()
            self.scheduleNext()
        }
        RunLoop.main.add(timer!, forMode: .common)
    }
}


