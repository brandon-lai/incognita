import { Button as Primitive } from '@base-ui/react/button';

export function Button({ className, ...props }: Omit<Primitive.Props, 'className'> & { className?: string }) {
  return <Primitive data-slot="button" className={className ? `btn ${className}` : 'btn'} {...props} />;
}
