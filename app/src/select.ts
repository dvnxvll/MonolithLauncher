export const setSelectOptions = (
  select: HTMLSelectElement | null,
  options: { value: string; label: string }[],
  placeholder = 'Select'
) => {
  if (!select) return;
  select.innerHTML = '';
  const placeholderOption = document.createElement('option');
  placeholderOption.textContent = placeholder;
  placeholderOption.value = '';
  placeholderOption.disabled = true;
  placeholderOption.selected = options.length === 0;
  select.appendChild(placeholderOption);
  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = option.value;
    el.textContent = option.label;
    select.appendChild(el);
  });
  if (options.length) {
    select.value = options[0].value;
  }
};
