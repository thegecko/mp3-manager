import type { CSSProperties, FC, PropsWithChildren } from 'preact/compat'
import { type DropTargetMonitor, useDrop } from 'react-dnd'
import { NativeTypes } from 'react-dnd-html5-backend'

const style: CSSProperties = {
	width: '100%',
	padding: '1rem',
	textAlign: 'center',
}

export interface TargetBoxProps {
    onNew: () => any
	onDrop: (item: { files: any[] }) => void
}

export const TargetBox: FC<TargetBoxProps> = (props: PropsWithChildren<TargetBoxProps>) => {
	const { onDrop } = props
	const [{ canDrop, isOver }, drop] = useDrop(
		() => ({
			accept: [NativeTypes.FILE],
			drop(item: { files: any[] }) {
				if (onDrop) {
                    onDrop(item)
				}
			},
            hover(item: any, monitor) {
                if (!item.id && monitor.getItemType() === NativeTypes.FILE) {
					item.id = props.onNew()
                }
            },
			collect: (monitor: DropTargetMonitor) => {
				return {
					isOver: monitor.isOver(),
					canDrop: monitor.canDrop(),
				}
			},
		}),
		[props],
	)

	const isActive = canDrop && isOver
	return (
		<div ref={drop} style={style}>
			{props.children ? undefined : isActive ? 'Release to drop' : 'Drag file here'}
            {props.children}
		</div>
	)
}