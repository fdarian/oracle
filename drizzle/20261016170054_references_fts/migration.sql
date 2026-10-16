-- Trigram keeps case-insensitive substring matching while adding bm25 ranking; rowid is references.id.
CREATE VIRTUAL TABLE `references_fts` USING fts5(name, domains, repo, notes, tokenize = 'trigram');
