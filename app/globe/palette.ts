// The chart's colours (PRD "Visual direction"): warm parchment for the fog
// and UI, iron-gall brown and black ink, a muted sea blue. Full natural
// colour only on revealed land. Mirrored as CSS custom properties in styles.css.

export const PALETTE = {
  parchment: '#e6d6b0',
  parchmentDark: '#c4ad80',
  parchmentLight: '#f3e8cd',
  ink: '#2a1c11',
  char: '#5a3519',
  ember: '#ff7a1f',
  sea: '#9db3b6',
  seaDeep: '#5f7f8a',
  route: '#8f2a17',
  coast: '#2a1c11',
  river: '#2f5566',
  ghost: '#4e3620',
  star: '#f3e8cd',
};

/** Night-side multiplier, linear. Dim, never black. */
export const NIGHT: [number, number, number] = [0.16, 0.17, 0.24];
