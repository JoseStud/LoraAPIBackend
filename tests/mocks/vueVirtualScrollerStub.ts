import { defineComponent, h } from 'vue';

type ScrollerProps<T = unknown> = {
  items: T[];
  tag?: string;
};

type ItemSlot<T = unknown> = {
  item: T;
  index: number;
  active: boolean;
};

const createScroller = (name: string) =>
  defineComponent({
    name,
    props: {
      items: {
        type: Array,
        default: () => []
      },
      tag: {
        type: String,
        default: 'div'
      }
    },
    setup(props: ScrollerProps, { slots }) {
      return () => {
        const items = Array.isArray(props.items)
          ? props.items.slice(0, Math.min(20, props.items.length))
          : [];

        return h(
          props.tag ?? 'div',
          { class: name },
          items.length > 0
            ? items.map((item, index) =>
                slots.default
                  ? slots.default({
                      item,
                      index,
                      active: true
                    } as ItemSlot)
                  : []
              )
            : []
        );
      };
    }
  });

const createScrollerItem = (name: string) =>
  defineComponent({
    name,
    props: {
      tag: {
        type: String,
        default: 'div'
      }
    },
    setup(props: { tag?: string }, { slots }) {
      return () =>
        h(props.tag ?? 'div', { class: name }, slots.default ? slots.default() : []);
    }
  });

export const RecycleScroller = createScroller('RecycleScroller');
export const DynamicScroller = createScroller('DynamicScroller');
export const DynamicScrollerItem = createScrollerItem('DynamicScrollerItem');

export default {
  RecycleScroller,
  DynamicScroller,
  DynamicScrollerItem
};
