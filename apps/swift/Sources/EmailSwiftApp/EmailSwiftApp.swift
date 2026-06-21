import AppKit
import SwiftUI

@main
struct EmailSwiftApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            InboxView()
        }
        .windowResizability(.contentSize)
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
    }
}

struct InboxView: View {
    @State private var selectedEmailID: EmailSummary.ID?

    private let emails = EmailSummary.sampleInbox

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                InboxHeader(unreadCount: emails.filter { !$0.isRead }.count)

                List(selection: $selectedEmailID) {
                    ForEach(emails) { email in
                        EmailRow(email: email)
                            .tag(email.id)
                    }
                }
                .listStyle(.plain)
            }
            .navigationTitle("Inbox")
        } detail: {
            if let selectedEmail = emails.first(where: { $0.id == selectedEmailID }) {
                EmailDetailPlaceholder(email: selectedEmail)
            } else {
                ContentUnavailableView(
                    "Hello, email",
                    systemImage: "envelope",
                    description: Text("Select a message to preview it.")
                )
            }
        }
        .frame(minWidth: 840, minHeight: 560)
    }
}

struct InboxHeader: View {
    let unreadCount: Int

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("Hello, email")
                    .font(.title2.weight(.semibold))
                Text("\(unreadCount) unread messages")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
            } label: {
                Label("Refresh", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
        }
        .padding()
        .background(.background)
    }
}

struct EmailRow: View {
    let email: EmailSummary

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(email.isRead ? Color.clear : Color.accentColor)
                .frame(width: 8, height: 8)
                .padding(.top, 7)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text(email.senderDisplayName)
                        .font(.subheadline.weight(email.isRead ? .regular : .semibold))
                        .lineLimit(1)

                    if email.hasAttachments {
                        Image(systemName: "paperclip")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Text(email.subject ?? "(no subject)")
                    .font(.subheadline.weight(email.isRead ? .regular : .medium))
                    .foregroundStyle(email.isRead ? .secondary : .primary)
                    .lineLimit(1)

                Text(email.snippet ?? "")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            Spacer(minLength: 12)

            VStack(alignment: .trailing, spacing: 6) {
                Text(email.relativeDate)
                    .font(.caption)
                    .foregroundStyle(.secondary)

                if email.threadCount > 1 {
                    Text("\(email.threadCount)")
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.quaternary, in: Capsule())
                }
            }
        }
        .padding(.vertical, 8)
        .contentShape(Rectangle())
    }
}

struct EmailDetailPlaceholder: View {
    let email: EmailSummary

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(email.subject ?? "(no subject)")
                .font(.title.weight(.semibold))

            VStack(alignment: .leading, spacing: 4) {
                Text(email.senderDisplayName)
                    .font(.headline)
                Text(email.sender)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Divider()

            Text(email.snippet ?? "No preview available.")
                .font(.body)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding(28)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

struct EmailSummary: Identifiable, Hashable {
    let id: String
    let threadID: String
    let sender: String
    let subject: String?
    let snippet: String?
    let date: Date
    let isRead: Bool
    let hasAttachments: Bool
    let threadCount: Int
    let labels: [String]

    var senderDisplayName: String {
        let pattern = #"^(.+?)\s*<[^>]+>$"#
        guard let regex = try? Regex(pattern),
              let match = sender.firstMatch(of: regex),
              let name = match.output[1].substring
        else {
            return sender
        }
        return String(name).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var relativeDate: String {
        if Calendar.current.isDateInToday(date) {
            return date.formatted(date: .omitted, time: .shortened)
        }

        if Calendar.current.isDateInYesterday(date) {
            return "Yesterday"
        }

        return date.formatted(.dateTime.month(.abbreviated).day())
    }

    static let sampleInbox: [EmailSummary] = [
        EmailSummary(
            id: "msg_001",
            threadID: "thread_001",
            sender: "Avery Stone <avery@example.com>",
            subject: "Launch checklist",
            snippet: "I pulled together the remaining launch items. The main thing left is confirming the native inbox handoff.",
            date: Date().addingTimeInterval(-18 * 60),
            isRead: false,
            hasAttachments: false,
            threadCount: 3,
            labels: ["INBOX", "UNREAD"]
        ),
        EmailSummary(
            id: "msg_002",
            threadID: "thread_002",
            sender: "Morgan Lee <morgan@example.com>",
            subject: "Design notes for the email list",
            snippet: "The web view keeps the row dense: sender, subject, snippet, relative date, attachment marker, and unread state.",
            date: Date().addingTimeInterval(-2 * 60 * 60),
            isRead: true,
            hasAttachments: true,
            threadCount: 1,
            labels: ["INBOX"]
        ),
        EmailSummary(
            id: "msg_003",
            threadID: "thread_003",
            sender: "Jamie Chen <jamie@example.com>",
            subject: "SQLite sync follow-up",
            snippet: "Once the Swift shell is in place we can decide whether to read the local mailbox directly or expose a small API from core.",
            date: Date().addingTimeInterval(-26 * 60 * 60),
            isRead: false,
            hasAttachments: false,
            threadCount: 2,
            labels: ["INBOX", "UNREAD"]
        ),
        EmailSummary(
            id: "msg_004",
            threadID: "thread_004",
            sender: "Product Updates <updates@example.com>",
            subject: nil,
            snippet: "Weekly account summary and billing notification.",
            date: Date().addingTimeInterval(-4 * 24 * 60 * 60),
            isRead: true,
            hasAttachments: false,
            threadCount: 1,
            labels: ["INBOX", "CATEGORY_UPDATES"]
        )
    ]
}
