import {
  Archive,
  Bell,
  Contact,
  Inbox,
  Mail,
  MessagesSquare,
  Star,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SidebarCountKey =
  | "inbox"
  | "primary"
  | "promotions"
  | "social"
  | "updates"
  | "forums"
  | "starred";

type InboxRouteSearch = {
  q: undefined;
  threads: undefined;
  category: string | undefined;
  compose: undefined;
  replyTo: undefined;
};

type ContactsRouteSearch = {
  q: undefined;
  sort: undefined;
  dir: undefined;
};

interface MailViewBase {
  id: string;
  title: string;
  icon: LucideIcon;
  keywords: string[];
  countKey?: SidebarCountKey;
}

export interface InboxMailView extends MailViewBase {
  route: {
    to: "/";
    search: InboxRouteSearch;
  };
}

export interface ContactsMailView extends MailViewBase {
  route: {
    to: "/contacts";
    search: ContactsRouteSearch;
  };
}

export type MailView = InboxMailView | ContactsMailView;

export const inboxView: InboxMailView = {
  id: "inbox",
  title: "Inbox",
  icon: Inbox,
  keywords: ["mail", "all", "default"],
  countKey: "inbox",
  route: {
    to: "/",
    search: {
      q: undefined,
      threads: undefined,
      category: undefined,
      compose: undefined,
      replyTo: undefined,
    },
  },
};

export const inboxCategoryViews: InboxMailView[] = [
  {
    id: "primary",
    title: "Primary",
    icon: Mail,
    keywords: ["personal", "important"],
    countKey: "primary",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "primary",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "promotions",
    title: "Promotions",
    icon: Tag,
    keywords: ["marketing", "offers", "deals"],
    countKey: "promotions",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "promotions",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "social",
    title: "Social",
    icon: Users,
    keywords: ["network", "friends", "community"],
    countKey: "social",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "social",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "updates",
    title: "Updates",
    icon: Bell,
    keywords: ["notifications", "activity"],
    countKey: "updates",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "updates",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "forums",
    title: "Forums",
    icon: MessagesSquare,
    keywords: ["lists", "groups", "discussions"],
    countKey: "forums",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "forums",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
];

export const secondaryMailViews: MailView[] = [
  {
    id: "starred",
    title: "Starred",
    icon: Star,
    keywords: ["favorites", "important"],
    countKey: "starred",
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "starred",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "archive",
    title: "Archive",
    icon: Archive,
    keywords: ["archived", "saved"],
    route: {
      to: "/",
      search: {
        q: undefined,
        threads: undefined,
        category: "archive",
        compose: undefined,
        replyTo: undefined,
      },
    },
  },
  {
    id: "contacts",
    title: "Contacts",
    icon: Contact,
    keywords: ["people", "address book"],
    route: {
      to: "/contacts",
      search: { q: undefined, sort: undefined, dir: undefined },
    },
  },
];

export const commandPaletteViews: MailView[] = [
  inboxView,
  ...inboxCategoryViews,
  ...secondaryMailViews,
];

export function isInboxCategoryView(category?: string) {
  return inboxCategoryViews.some((view) => view.id === category);
}

export function getActiveMailViewId(options: {
  category?: string;
  isContactsRoute: boolean;
}) {
  if (options.isContactsRoute) return "contacts";
  if (options.category && commandPaletteViews.some((view) => view.id === options.category)) {
    return options.category;
  }
  return "inbox";
}
