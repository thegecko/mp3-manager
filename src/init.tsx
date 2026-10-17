import { useBusy, useDb } from './context';
import { primaryButtonStyle } from './styles';

const downloadFile = (file: File): void => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

export const Init = () => {
    const { db } = useDb();
    const { updateBusy } = useBusy();

    const onCreateInitFile = async () => {
        if (!db) {
            return;
        }

        try {
            updateBusy(true);
            const usb = (navigator as any).usb;
            if (!usb) {
                throw new Error('WebUSB is not available in this browser');
            }

            const device = await usb.requestDevice({ filters: [] });
            if (!device) {
                return;
            }

            const file = await db.createInitFile(device);
            downloadFile(file);
        } catch (e) {
            alert(e);
        } finally {
            updateBusy(false);
        }
    };

    return (
        <>
            {db &&
                <button style={primaryButtonStyle}
                    onClick={onCreateInitFile}>
                    Create Init File
                </button>
            }
        </>
    );
};
