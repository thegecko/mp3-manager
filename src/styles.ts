import type { JSX } from 'preact';

export const primaryButtonStyle: JSX.CSSProperties = {
    background: '#2f7dd1',
    borderRadius: '999px',
    boxShadow: '0 4px 10px rgba(47,125,209,.24)',
    color: '#ffffff',
    fontWeight: 700,
    marginRight: '10px',
    padding: '0.55rem 0.8rem'
};

export const actionButtonStyle: JSX.CSSProperties = {
    background: '#eef6ff',
    border: '1px solid #cfe0f2',
    borderRadius: '999px',
    color: '#315c86',
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1,
    marginLeft: '0.25rem',
    minWidth: '28px',
    padding: '0.38rem 0.5rem'
};

export const dangerButtonStyle: JSX.CSSProperties = {
    ...actionButtonStyle,
    background: '#fff1f0',
    border: '1px solid #ffd3cf',
    color: '#a33a32'
};

export const statusPillStyle: JSX.CSSProperties = {
    background: '#eef4fb',
    borderRadius: '999px',
    color: '#46627d',
    fontSize: '13px',
    fontWeight: 700,
    marginLeft: 'auto',
    padding: '0.45rem 0.7rem'
};

export const footerStyle: JSX.CSSProperties = {
    alignItems: 'center',
    background: 'rgba(224,237,246,.95)',
    borderTop: '1px solid #c3d7e5',
    boxShadow: '0 -8px 22px rgba(36,48,66,.06)',
    display: 'flex',
    height: '50px',
    padding: '0 12px'
};

export const containerStyle: JSX.CSSProperties = {
    flex: 1,
    overflow: 'auto',
    padding: '1rem 1.25rem'
};

export const emptyStyle: JSX.CSSProperties = {
    alignItems: 'center',
    background: 'rgba(255,255,255,.55)',
    border: '2px dashed #b7c9d9',
    borderRadius: '18px',
    color: '#668096',
    display: 'flex',
    fontSize: '18px',
    fontWeight: 700,
    height: '100%',
    justifyContent: 'center',
    minHeight: '220px',
    textAlign: 'center'
};

export const fileStyle: JSX.CSSProperties = {
    alignItems: 'center',
    border: '1px solid #d7e3ef',
    borderRadius: '12px',
    boxShadow: '0 4px 12px rgba(36, 48, 66, 0.06)',
    cursor: 'move',
    display: 'flex',
    gap: '0.5rem',
    margin: '0.35rem 0',
    minHeight: '42px',
    padding: '0.45rem 0.65rem'
};

export const titleWrapStyle: JSX.CSSProperties = {
    flex: 1,
    overflow: 'hidden',
    textAlign: 'left',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
};

export const artistStyle: JSX.CSSProperties = {
    color: '#7a8da3',
    fontSize: '12px',
    marginLeft: '0.55rem'
};

export const actionsStyle: JSX.CSSProperties = {
    alignContent: 'center',
    marginLeft: 'auto',
    whiteSpace: 'nowrap'
};
