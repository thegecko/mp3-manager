import { useRef } from 'preact/hooks'
import type { ComponentChild } from 'preact'
import type { PropsWithChildren } from 'preact/compat'
import { useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const style = {
	flex: 1,
    overflow: 'auto',
	padding: '1rem',
	textAlign: 'center',
}

export interface FileContainerProps {
    onNew: () => any
}

export const FileContainer = (props: PropsWithChildren<FileContainerProps>) => {
	const { onNew } = props;
	const ref = useRef(null)

	const [, connectDrop] = useDrop(() => ({
		accept: NativeTypes.FILE,
		hover(item: any, monitor) {
			if (!item.id && monitor.getItemType() === NativeTypes.FILE) {
				item.id = onNew()
			}
		}
	}), [props]);

	connectDrop(ref);
	const hasFiles = (props.children as ComponentChild[]).length > 0;

	return (
		<div ref={ref} style={style}>
			{hasFiles ? undefined : 'Drag Files Here'}
            {props.children}
		</div>
	);
}
