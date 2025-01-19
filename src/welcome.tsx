import { DriveSelect } from "./drive-select"

const style = {
    flex: 1,
    textAlign: 'center',
    alignContent: 'center',
}

export const Welcome = () =>{
    return (
        <div style={style}>
            <div>🎵Welcome to <a href='https://github.com/thegecko/mp3-manager'>MP3 Manager</a>🎵</div>
            <DriveSelect />
        </div>
    )
}
