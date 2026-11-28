// Domains that hand out throwaway inboxes. Kept short and conservative: a wrong entry blocks a real customer.
export const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamailblock.com", "sharklasers.com",
  "grr.la", "pokemail.net", "spam4.me", "10minutemail.com", "10minutemail.net", "20minutemail.com", "tempmail.com", "temp-mail.org", "temp-mail.io",
  "tempmailo.com", "tempail.com", "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.net", "trashmail.de", "trash-mail.com",
  "yopmail.com", "yopmail.net", "yopmail.fr", "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mailcatch.com",
  "mintemail.com", "mytemp.email", "fakeinbox.com", "fakemail.net", "emailondeck.com", "discard.email", "discardmail.com", "spamgourmet.com",
  "mohmal.com", "burnermail.io", "moakt.com", "mailtemp.info", "inboxbear.com", "tmail.ws", "tmpmail.net", "tmpmail.org", "dropmail.me",
  "mail.tm", "1secmail.com", "1secmail.net", "1secmail.org", "emailfake.com", "email-fake.com", "crazymailing.com", "mailforspam.com",
  "spambox.us", "spamex.com", "spamfree24.org", "jetable.org", "mailexpire.com", "mailmoat.com", "mailnull.com", "mt2015.com", "owlymail.com",
  "put2.net", "rmqkr.net", "wegwerfmail.de", "wegwerfmail.net", "zetmail.com", "33mail.com", "anonbox.net", "armyspy.com", "cuvox.de",
  "dayrep.com", "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com", "teleworm.us", "yomail.info",
]);

// Mailboxes read by a team or a robot, where a reply to one person is unlikely.
export const ROLE_LOCALS = new Set([
  "admin", "administrator", "info", "contact", "hello", "office", "sales", "support", "help", "billing", "accounts", "accounting", "finance",
  "hr", "jobs", "careers", "press", "media", "marketing", "team", "mail", "enquiries", "inquiries", "service", "webmaster", "postmaster",
  "hostmaster", "abuse", "security", "noreply", "no-reply", "donotreply", "do-not-reply", "root", "orders", "booking", "reception",
]);

export const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.de", "yahoo.fr", "outlook.com", "hotmail.com", "hotmail.co.uk", "live.com",
  "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "gmx.net", "web.de", "mail.com", "zoho.com",
  "yandex.com", "yandex.ru", "mail.ru", "fastmail.com", "freemail.hu", "citromail.hu", "t-online.de", "libero.it", "orange.fr", "laposte.net",
]);

// Misspellings seen in real lists, and the provider each one was meant to be.
export const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gnail.com": "gmail.com", "gmail.co": "gmail.com",
  "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.om": "gmail.com", "gmaill.com": "gmail.com", "gmail.comm": "gmail.com", "gmeil.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com", "yahoo.co": "yahoo.com", "yhoo.com": "yahoo.com",
  "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com", "hotmai.com": "hotmail.com", "hotnail.com": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "outloook.com": "outlook.com", "outlool.com": "outlook.com",
  "iclod.com": "icloud.com", "icloud.con": "icloud.com", "icoud.com": "icloud.com", "protonmail.con": "protonmail.com",
};
