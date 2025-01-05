
const style = {
    height: '50px',
    display: 'flex',
    alignItems: 'center',
    background: 'lightblue',
}

interface FooterProps {
	onSelectDrive: () => void;
}

export const Footer = (props: FooterProps) => {
    return (
        <div style={style}>
            <button
                class="bg-blue-500 hover:bg-blue-400 rounded-md text-white px-2 py-1 m-2"
                onClick={props.onSelectDrive}>
                    Select Drive
            </button>
        </div>
    );
};
