import { useCallback, useState } from 'react';

/**
 * Buttons copy a command for you to paste. They never send anything. Discord
 * prohibits automating a user account, and no bot API can invoke another bot's
 * slash commands, so a compliant tool cannot send on your behalf.
 */
const COMMANDS: ReadonlyArray<{ c: string; d: string }> = [
  { c: 'dun fight', d: 'Explore and engage' },
  { c: 'dun logs get 1', d: 'Pull the last fight log' },
  { c: 'dun logs get 2', d: 'The one before that' },
  { c: 'dun logs get 3', d: 'Three fights back' },
  { c: 'dun pray', d: 'Offer to your god' },
  { c: 'dun rest', d: 'Recover HP and mana' },
  { c: 'dun stats', d: 'Your character sheet' },
  { c: 'dun inventory', d: 'Carried items' },
  { c: 'dun skills', d: 'Skill training' },
  { c: 'dun equip', d: 'Change loadout' },
  { c: 'dun logs', d: 'List stored logs' },
  { c: 'dun help', d: 'Full command list' },
];

export function CommandDeck() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(cmd);
    } catch {
      // Clipboard blocked (insecure context or denied permission). Say so
      // rather than pretending it worked.
      setCopied(`__failed__${cmd}`);
    }
    window.setTimeout(() => setCopied(null), 1800);
  }, []);

  return (
    <section>
      <p className="eyebrow">Command deck</p>
      <h2 className="title">The compliant control panel</h2>
      <div className="panel deck">
        <p className="note">
          <b>How this works.</b> Discord forbids automating a user account, and no bot API can invoke
          another bot&rsquo;s commands. So these buttons copy the exact command to your clipboard,
          and you paste and send it yourself. Same keystrokes saved, no risk to your account. It sits
          behind one interface, so a real sender drops in if Dundor ever ships an API.
        </p>
        <div className="deckgrid">
          {COMMANDS.map(({ c, d }) => {
            const state = copied === c ? 'ok' : copied === `__failed__${c}` ? 'fail' : null;
            return (
              <button key={c} type="button" className={`cmd${state ? ' copied' : ''}`} onClick={() => copy(c)}>
                <span className="c">{c}</span>
                <span className="d">
                  {state === 'ok' ? 'Copied, paste it in Discord'
                    : state === 'fail' ? 'Select and copy manually'
                    : d}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
