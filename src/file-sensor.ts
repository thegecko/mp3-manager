import type {DragEvent, PointerEvent} from 'preact/compat';
import {getOwnerDocument} from '@dnd-kit/utilities';

import type {SensorProps} from '@dnd-kit/core';
import {
  AbstractPointerSensor,
  AbstractPointerSensorOptions,
  PointerEventHandlers,
} from '@dnd-kit/core';

const events: PointerEventHandlers = {
  cancel: {name: 'pointercancel'},
  move: {name: 'pointermove'},
  end: {name: 'pointerup'},
};

export interface DragSensorOptions extends AbstractPointerSensorOptions {}

export type DragSensorProps = SensorProps<DragSensorOptions>;

export class FileSensor extends AbstractPointerSensor {
  public target: EventTarget | null;
  constructor(props: DragSensorProps) {
    const {event} = props;
    // Pointer events stop firing if the target is unmounted while dragging
    // Therefore we attach listeners to the owner document instead
    const listenerTarget = getOwnerDocument(event.target);
    super(props, events, listenerTarget);
    this.target = listenerTarget;
  }

  protected handleMove(event: Event) {
    // console.log('handleMove', event);
    super.handleMove(event);
  }

  protected handleDrag(event: Event) {
    console.log('handleDrag', event);
    event.preventDefault();
  }

  protected attach() {
    console.log('attach');
    this.listeners.add('dragStart', this.handleDrag);
    this.listeners.add('dragEnd', this.handleDrag);
    this.listeners.add('dragEnter', this.handleDrag);
    this.listeners.add('dragOver', this.handleDrag);
    this.listeners.add('drag', this.handleDrag);
    this.listeners.add('drop', this.handleDrag);
    super.attach();
  }

  static activators = [
    {
      eventName: 'onDragEnter' as const,
      handler: (
        {nativeEvent: event}: DragEvent,
        {onActivation}: DragSensorOptions
      ) => {
        console.log('onDragEnter', event);
        console.log(this.target);
        /*
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }
          */

        onActivation?.({event});

        return true;
      },
    },
    {
      eventName: 'onDragOver' as const,
      handler: (
        {nativeEvent: event}: DragEvent,
        {onActivation}: DragSensorOptions
      ) => {
        console.log('onDragOver', event);
        /*
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }
          */

        onActivation?.({event});

        return true;
      },
    },
    {
      eventName: 'onPointerDown' as const,
      handler: (
        {nativeEvent: event}: PointerEvent,
        {onActivation}: DragSensorOptions
      ) => {
        console.log('onPointerDown', event);
        if (!event.isPrimary || event.button !== 0) {
          return false;
        }

        onActivation?.({event});

        return true;
      },
    },
  ];
}
