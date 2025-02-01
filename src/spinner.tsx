import { useBusy } from './context';

const style = {
    flex: 1,
    textAlign: 'center',
    alignContent: 'center',
    position: 'fixed',
    padding: 0,
    margin: 0,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'rgba(220,220,220,0.85)',
    zIndex: 1000
}

const loader = {
    width: '36px',
    height: '36px',
    border: '5px solid dodgerblue',
    borderBottomColor: 'transparent',
    borderRadius: '50%',
    display: 'inline-block',
    boxSizing: 'border-box',
    animation: 'rotation 1s linear infinite',
    margin: '10px'
}

export const Spinner = () => {
    const { busy } = useBusy();

    return (
        <>
            {busy &&
                <div style={style}>
                    <div style={loader}></div>
                    <div>Working...</div>
                </div>
            }
        </>
    );
};
