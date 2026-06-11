export interface SelectOption {
  id: string;
  name: string;
}

export const toUniqueSelectOptions = (
  rows: Array<{ id: string | null; name: string | null }>
) => {
  const optionsById = new Map<string, SelectOption>();

  rows.forEach(({ id, name }) => {
    if (id && name) {
      optionsById.set(id, { id, name });
    }
  });

  return Array.from(optionsById.values());
};
