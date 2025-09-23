import { defineComponent, h } from 'vue';

// Minimal stub implementation to unblock builds without the real dependency.
// Renders items sequentially and forwards slot content.
export const RecycleScroller = defineComponent({
  name: 'RecycleScrollerStub',
  props: {
    items: { type: Array, default: () => [] },
    itemSize: { type: Number, default: 0 },
    keyField: { type: String, default: 'id' },
    buffer: { type: Number, default: 200 },
    pageMode: { type: Boolean, default: false },
    minItemSize: { type: Number, default: 0 },
  },
  setup(props, { slots }) {
    return () => {
      const children = Array.isArray(props.items)
        ? (props.items
            .map((item: unknown, index: number) => (slots.default ? slots.default({ item, index }) : null))
            .flat() // default slot can return arrays
            .filter(Boolean) as any)
        : [];
      return h('div', { class: 'recycle-scroller-stub' }, children);
    };
  },
});

export default { RecycleScroller };
