'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Text } from '@cloudflare/kumo';
import styles from './library.module.css';

export default function LibraryPage() {
  const [folders, setFolders] = useState([]);
  const [newFolderName, setNewFolderName] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchFolders = async () => {
    const res = await fetch('/api/folders');
    const data = await res.json();
    setFolders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newFolderName) return;
    
    await fetch('/api/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolderName })
    });
    setNewFolderName('');
    fetchFolders();
  };

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div className={styles.headerNav}>
          <Link href="/" className={styles.navLink}>← Home</Link>
          <h1 className={styles.title}>Library</h1>
        </div>
        
        <form onSubmit={handleCreate} className={styles.createForm}>
          <Input 
            value={newFolderName} 
            onChange={(e) => setNewFolderName(e.target.value)} 
            placeholder="New folder name"
            className={styles.input}
            required
          />
          <Button type="submit" variant="primary">Create</Button>
        </form>
      </header>

      {loading ? (
        <Text>Loading...</Text>
      ) : (
        <div className={styles.grid}>
          {folders.map(folder => (
            <Link key={folder.id} href={`/library/${folder.id}`} className={styles.folderCard}>
              <h2 className={styles.folderName}>{folder.name}</h2>
              <span className={styles.folderDate}>{new Date(folder.createdAt).toLocaleDateString()}</span>
            </Link>
          ))}
          {folders.length === 0 && <Text>No folders yet</Text>}
        </div>
      )}
    </main>
  );
}
