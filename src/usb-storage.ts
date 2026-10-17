export const transferUsbStorageCommand = async (device: USBDevice, command: Uint8Array, responseLength: number): Promise<Uint8Array> => {
    await device.open();
    if (!device.configuration) {
        await device.selectConfiguration(1);
    }

    for (const iface of device.configuration.interfaces) {
        for (const alternate of iface.alternates) {
            const bulkIn = alternate.endpoints.find((endpoint: any) => endpoint.type === 'bulk' && endpoint.direction === 'in');
            const bulkOut = alternate.endpoints.find((endpoint: any) => endpoint.type === 'bulk' && endpoint.direction === 'out');
            if (bulkIn && bulkOut) {
                await device.claimInterface(iface.interfaceNumber);
                if (device.selectAlternateInterface && alternate.alternateSetting !== 0) {
                    await device.selectAlternateInterface(iface.interfaceNumber, alternate.alternateSetting);
                }

                await device.transferOut(bulkOut.endpointNumber, command);
                const data = await device.transferIn(bulkIn.endpointNumber, responseLength);
                await device.transferIn(bulkIn.endpointNumber, 13).catch(() => undefined);

                if (!data.data) {
                    throw new Error('USB storage command did not return data');
                }

                await device.close();
                return new Uint8Array(data.data.buffer, data.data.byteOffset, data.data.byteLength);
            }
        }
    }

    await device.close();
    throw new Error('No bulk USB storage interface found');
};
