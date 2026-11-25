import { sprite, stampFor } from '../art/stamps';

export function Postcard({ id }: { id: string }) {
  const stamp = stampFor(id);
  return (
    <svg className={`postcard ink-${stamp.color}`} viewBox="0 0 144 32" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path fill="var(--sky)" d="M0 0h144v32H0z" />
      <path fill="var(--sun)" d="M108 3h6v2h2v5h-2v2h-6v-2h-2V5h2z" />
      <use href={sprite('cloud')} x="11" y="3" width="21" height="8" opacity=".8" />
      <path fill="var(--far)" d="M0 17h9v-2h8v2h10v2h16v-3h6v-2h7v-2h6v2h8v2h9v2h22v-3h7v-2h7v2h12v2h17v15H0z" />
      <path fill="var(--water)" d="M0 21h144v11H0z" />
      <path fill="var(--foam)" d="M4 24h11v1H4zm21 4h7v1h-7zm30-5h8v1h-8zm27 4h12v1H82zm40-3h9v1h-9zm13 5h6v1h-6z" />
      <use href={sprite(stamp.landmark)} x="79" y="5" width="29" height="20" />
      <use href={sprite(stamp.vessel)} x="28" y="1" width="40" height="30" />
    </svg>
  );
}
