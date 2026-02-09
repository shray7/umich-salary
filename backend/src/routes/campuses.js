const CAMPUSES = [
  { id: 0, name: 'All' },
  { id: 1, name: 'Ann Arbor' },
  { id: 2, name: 'Dearborn' },
  { id: 3, name: 'Flint' },
];

export function getCampuses(_req, res) {
  res.json(CAMPUSES);
}
