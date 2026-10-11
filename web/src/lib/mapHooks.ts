// Hooks the map registers so code outside React Flow can read its selection and turn screen points into map points.
export const mapHooks = {
  selectedIds: (): string[] => [],
  toFlow: (p: { x: number; y: number }): { x: number; y: number } | null => (p ? null : null),
  fit: () => {},
  tidy: () => {},
}
