export const Warning = () =>{
    const invalidBrowser = typeof showDirectoryPicker === 'undefined' || typeof AudioContext === 'undefined';

    return (
        !invalidBrowser ? undefined :
        <div>
            Use a browser with 'FileSystem API' and 'WebAudio API' available (e.g. Chrome or Edge)
        </div>
    )
}
