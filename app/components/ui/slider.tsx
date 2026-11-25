import { Slider as Primitive } from '@base-ui/react/slider';
import type { ReactNode } from 'react';

type Props = Pick<Primitive.Root.Props<number>, 'value' | 'max' | 'step' | 'largeStep' | 'onValueChange'> & {
  label: string;
  valueText: string;
  children?: ReactNode;
};

export function Slider({ label, valueText, children, ...props }: Props) {
  return (
    <Primitive.Root data-slot="slider" className="track" {...props}>
      <Primitive.Control className="track-control">
        <Primitive.Track className="track-line">
          <Primitive.Indicator className="track-fill" />
        </Primitive.Track>
        {children}
        <Primitive.Thumb className="track-head" aria-label={label} aria-valuetext={valueText} />
      </Primitive.Control>
    </Primitive.Root>
  );
}
