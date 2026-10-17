import { useRef } from 'preact/hooks'
import type { ComponentChild } from 'preact'
import type { PropsWithChildren } from 'preact/compat'
import { useFileContainerDrop } from '../dnd/file-container-drop'
import { emptyStyle } from '../styles'
import { containerStyle } from '../styles'

export interface FileContainerProps {
    onNew: () => any
    clearNew: () => void
}

export const FileContainer = (props: PropsWithChildren<FileContainerProps>) => {
	const { onNew, clearNew } = props;
	const ref = useRef(null)
	const connectDrop = useFileContainerDrop({ onNew, clearNew });

	connectDrop(ref);
	const hasFiles = (props.children as ComponentChild[]).length > 0;

	return (
		<div ref={ref} style={containerStyle}>
			{hasFiles ? undefined : <div style={emptyStyle}>Drop MP3 files or folders here</div>}
            {props.children}
		</div>
	);
}
