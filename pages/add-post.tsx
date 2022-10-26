import { useState } from 'react';
import styles from '../styles/Shared.module.css'

export default function AddPost() {
    const [title, setTitle] = useState('');
    const [sourceHref, setSourceHref] = useState('');
    const [logoHref, setLogoHref] = useState('');
    const [docsHref, setDocsHref] = useState('');
    const [dataRepoHref, setDataRepoHref] = useState('');
    const [sports, setSports] = useState('');
    const [repoType, setRepoType] = useState('');
    const [content, setContent] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const handlePost = async (e) => {
        e.preventDefault();

        // reset error and message
        setError('');
        setMessage('');

        // fields check
        if (!title || !sourceHref || !sports || !content) return setError('All fields are required');

        // post structure
        let post = {
            title,
            sourceHref,
            logoHref,
            docsHref,
            dataRepoHref,
            sports,
            repoType,
            content,
            published: false,
            createdAt: new Date().toISOString(),
        };
        // save the post
        let response = await fetch('/api/posts', {
            method: 'POST',
            body: JSON.stringify(post),
        });

        // get the data
        let data = await response.json();

        if (data.success) {
            // reset the fields
            setTitle('');
            setSourceHref('');
            setLogoHref('');
            setDocsHref('');
            setDataRepoHref('');
            setSports('');
            setRepoType('');
            setContent('');
            // set the message
            return setMessage(data.message);
        } else {
            // set the error
            return setError(data.message);
        }
    };

    return (
        <div>
            <div className={styles.container}>
                <form onSubmit={handlePost} className={styles.form}>
                    {error ? (
                        <div className={styles.formItem}>
                            <h3 className={styles.error}>{error}</h3>
                        </div>
                    ) : null}
                    {message ? (
                        <div className={styles.formItem}>
                            <h3 className={styles.message}>{message}</h3>
                        </div>
                    ) : null}
                    <div className={styles.formItem}>
                        <label>Package Title</label>
                        <input
                            type="text"
                            name="title"
                            onChange={(e) => setTitle(e.target.value)}
                            value={title}
                            placeholder="title"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>GitHub Source URL</label>
                        <input
                            type="text"
                            name="sourceHref"
                            onChange={(e) => setSourceHref(e.target.value)}
                            value={sourceHref}
                            placeholder="source URL"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Logo URL</label>
                        <input
                            type="text"
                            name="logoHref"
                            onChange={(e) => setLogoHref(e.target.value)}
                            value={logoHref}
                            placeholder="logo URL"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Documentation URL</label>
                        <input
                            type="text"
                            name="docsHref"
                            onChange={(e) => setDocsHref(e.target.value)}
                            value={docsHref}
                            placeholder="docs URL"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Data Repository URL</label>
                        <input
                            type="text"
                            name="dataRepoHref"
                            onChange={(e) => setDataRepoHref(e.target.value)}
                            value={dataRepoHref}
                            placeholder="data repo URL"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Sports</label>
                        <input
                            type="text"
                            name="sports"
                            onChange={(e) => setSports(e.target.value)}
                            value={sports}
                            placeholder="sports"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Repository Type</label>
                        <input
                            type="text"
                            name="repoType"
                            onChange={(e) => setRepoType(e.target.value)}
                            value={repoType}
                            placeholder="repository type: R, Python, Node.js, Data"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <label>Package Description</label>
                        <textarea
                            name="content"
                            onChange={(e) => setContent(e.target.value)}
                            value={content}
                            placeholder="content"
                        />
                    </div>
                    <div className={styles.formItem}>
                        <button type="submit">Add post</button>
                    </div>
                </form>
            </div>
        </div>
    );
}