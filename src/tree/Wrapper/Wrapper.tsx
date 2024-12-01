import classNames from 'classnames';

import './Wrapper.module.css';

interface Props {
  children: React.ReactNode;
  center?: boolean;
  style?: React.CSSProperties;
}

export function Wrapper({children, center, style}: Props) {
  return (
    <div
      className={classNames('Wrapper', center && 'center')}
      style={style}
    >
      {children}
    </div>
  );
}
