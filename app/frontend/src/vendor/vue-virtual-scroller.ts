import { defineComponent, h } from 'vue';

// Minimal stub implementation to unblock builds without the real dependency.
// Renders items sequentially and forwards slot content.
type RecycleScrollerProps<T = unknown> = {
  items: T[];
  tag?: string;
};

type ItemSlot<T = unknown> = {
  item: T;
  index: number;
  active: boolean;
};

const MAX_RENDERED_ITEMS = 50;

const pickVisibleItems = <T>(items: T[]): T[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.slice(0, Math.min(MAX_RENDERED_ITEMS, items.length));
};

export const RecycleScroller = defineComponent({
  name: 'RecycleScrollerStub',
  props: {
    items: { type: Array, default: () => [] },
    tag: { type: String, default: 'div' },
  },
  setup(props: RecycleScrollerProps, { slots }) {
    return () => {
      const visibleItems = pickVisibleItems(props.items ?? []);

      return h(
        props.tag ?? 'div',
        { class: 'recycle-scroller-stub' },
        visibleItems.length > 0
          ? visibleItems.map((item, index) =>
              slots.default
                ? slots.default({
                    item,
                    index,
                    active: true,
                  } as ItemSlot)
                : [],
            )
          : [],
      );
    };
  },
});

export default { RecycleScroller };
