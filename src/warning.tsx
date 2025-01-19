const style = {
    background: 'lightcoral',
    border: '1px solid darkred',
    padding: 10,
    textAlign: 'center',
    fontWeight: 'bold'
}

export const Warning = () =>{
    const invalidBrowser = typeof showDirectoryPicker === 'undefined' || typeof AudioContext === 'undefined';

    return (
        !invalidBrowser ? undefined :
        <div style={style}>
            ⚠️ Please use a browser with <a href='https://caniuse.com/filesystem'>FileSystem API</a> and <a href='https://caniuse.com/audio-api'>WebAudio API</a> available (e.g. Chrome or Edge)
        </div>
    )
}
