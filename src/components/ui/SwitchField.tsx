import type { InputHTMLAttributes, ReactNode, Ref } from "react";

export type SwitchFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "children"> & {
  label: ReactNode;
  ref?: Ref<HTMLInputElement>;
};

/// An on/off switch (task 0129): a real <input type="checkbox" role="switch"> inside a real <label>, so the accessible name, Space to toggle, form semantics and the whole row being clickable come
/// from the platform, and a screen reader says "switch, on/off". Use it for a setting that takes effect as soon as it is flipped (a view option, "show ..."); keep CheckboxField for a choice that
/// is submitted with a form. The track is drawn so it passes WCAG 1.4.11 (>= 3:1) in both themes: an off track has an `fg-muted` outline and knob, an on track is filled with the brand colour
/// and the knob is the page colour; a keyboard-focused one gets a solid 2 px ring. The invisible input covers the track and is 44 px tall, so the touch target is comfortable. Under
/// `forced-colors` the knob takes the system text colour. No motion when the person asks for less.
export function SwitchField({ label, className = "", ref, ...rest }: SwitchFieldProps) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg-2 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 ${className}`}
    >
      <span className="relative flex h-6 w-11 shrink-0 items-center">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className="peer absolute -top-2.5 left-0 h-11 w-11 cursor-[inherit] appearance-none opacity-0"
          {...rest}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none h-6 w-11 rounded-full border border-fg-muted bg-field transition-colors motion-reduce:transition-none peer-checked:border-brand-fg peer-checked:bg-brand-fg peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1 left-1 h-4 w-4 rounded-full bg-fg-muted transition-transform motion-reduce:transition-none peer-checked:translate-x-5 peer-checked:bg-canvas forced-colors:bg-[CanvasText]"
        />
      </span>
      <span>{label}</span>
    </label>
  );
}
