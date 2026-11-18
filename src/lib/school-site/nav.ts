// The navigation of the school's own website (task 0080), shared by its header and its footer. `/our-academics` is the old `/academics`; the old site's result portal is not brought back: "Portal" is AlEemaan's own parent and pupil portal (docs/tasks/0080).
export const SITE_NAV = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About Us" },
  { href: "/our-academics", label: "Academics" },
  { href: "/admissions", label: "Admissions" },
  { href: "/contact", label: "Contact" },
  { href: "/anthem", label: "School Anthem" },
  { href: "/portal", label: "Portal" },
] as const;

/// The way into the school software, last in the header: the page with a button for each kind of person (it goes to the one sign-in form when the portals are off, and to each portal's own
/// address when they are on), never straight to a sign-in form.
export const SITE_SIGN_IN = { href: "/select-role", label: "Sign in" } as const;

/// The school's own contact details, as the old footer gave them.
export const SITE_CONTACT = {
  place: "Ibadan, Oyo State",
  phone: "+234 815 300 5393",
  phoneHref: "tel:+2348153005393",
  email: "aleemangroupofschools@gmail.com",
  hours: "Mon-Fri: 7:00 AM - 4:30 PM",
} as const;
