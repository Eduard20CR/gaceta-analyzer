import { useId, useState } from 'react';
import type { ReactNode } from 'react';

interface AdvancedSettingsProps {
  children: ReactNode;
}

/**
 * The "Configuración avanzada" section of the new job form (FR-02): closed by
 * default, opened and closed with a button. `aria-expanded` tells screen
 * readers whether it is open.
 */
export function AdvancedSettings({ children }: AdvancedSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  return (
    <div className="advanced-settings">
      <button
        type="button"
        className="advanced-settings__toggle"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
      >
        Configuración avanzada
      </button>
      {/* Closed means not rendered, but the values live in the page's state,
          so closing the section does not lose what the user typed. */}
      {isOpen && (
        <div id={contentId} className="advanced-settings__content">
          {children}
        </div>
      )}
    </div>
  );
}
