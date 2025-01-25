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
    background: 'rgba(255,255,255,0.85)',
    zIndex: 1000
}

export const Spinner = () => {
    const { busy } = useBusy();

    return (
        <>
            {busy &&
                <div style={style}>Syncing...</div>
            }
        </>
    );
};
