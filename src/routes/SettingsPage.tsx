import { WebClientUpdate } from "../components/WebClientUpdate";
import { useThemePreference, type ThemePreference } from "../lib/theme";
import { Segmented } from "../ui/Segmented";

const THEMES: { key: ThemePreference; label: string }[] = [
  { key: "system", label: "Match device" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

// Settings (build-plan §4): appearance and the web client's version. Devices
// join it in PR 7.
export function SettingsPage() {
  const [theme, setTheme] = useThemePreference();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-[1.75rem] font-extrabold text-ink">Settings</h1>
      <section aria-labelledby="appearance" className="mt-6 rounded-card border border-line bg-surface p-5">
        <h2 id="appearance" className="text-lg font-bold text-ink">
          Appearance
        </h2>
        <p className="mt-1 mb-4 text-sm text-ink-2">Saved on this device only.</p>
        <Segmented label="Theme" options={THEMES} value={theme} onChange={setTheme} />
      </section>
      {/* Brings its own heading, and hides itself on servers without updates. */}
      <div className="mt-6">
        <WebClientUpdate />
      </div>
    </div>
  );
}
