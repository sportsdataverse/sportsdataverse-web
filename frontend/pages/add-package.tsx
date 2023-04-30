import Container from '@components/Container'
import PageTop from "@components/PageTop";
import Head from 'next/head'
import { useState } from 'react'

export default function AddPackage() {
  const [title, setTitle] = useState('')
  const [sourceHref, setSourceHref] = useState('')
  const [logoHref, setLogoHref] = useState('')
  const [docsHref, setDocsHref] = useState('')
  const [dataRepoHref, setDataRepoHref] = useState('')
  const [sports, setSports] = useState('')
  const [repoType, setRepoType] = useState('')
  const [content, setContent] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handlePackage = async (e: any) => {
    e.preventDefault()

    // reset error and message
    setError('')
    setMessage('')

    // fields check
    if (!title || !sourceHref || !sports || !content) return setError('All fields are required')

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
    }
    // save the post
    let response = await fetch('/api/packages', {
      method: 'POST',
      body: JSON.stringify(post),
    })

    // get the data
    let data = await response.json()

    if (data.success) {
      // reset the fields
      setTitle('')
      setSourceHref('')
      setLogoHref('')
      setDocsHref('')
      setDataRepoHref('')
      setSports('')
      setRepoType('')
      setContent('')
      // set the message
      return setMessage(data.message)
    } else {
      // set the error
      return setError(data.message)
    }
  }

  return (
    <>
        <Head>
          <title>{`SDV: Add a Package to the Database`}</title>
        </Head>
        <div className="relative max-w-4xl mx-auto dark:bg-darkPrimary dark:text-gray-100 2xl:max-w-5xl 3xl:max-w-7xl">
          <section className="pageTop flex flex-col ">
            <PageTop pageTitle="Add Package">
              Add a Package to the Database.
            </PageTop>
          </section>
          <div className={'container'}>
            <form onSubmit={handlePackage} className={'form'}>
              {error ? (
                <div className={'formItem'}>
                  <h3 className={'error'}>{error}</h3>
                </div>
              ) : null}
              {message ? (
                <div className={'formItem'}>
                  <h3 className={'message'}>{message}</h3>
                </div>
              ) : null}
              <div className={'formItem'}>
                <label>Package Title</label>
                <input
                  type="text"
                  name="title"
                  onChange={(e) => setTitle(e.target.value)}
                  value={title}
                  placeholder="title"
                />
              </div>
              <div className={'formItem'}>
                <label>GitHub Source URL</label>
                <input
                  type="text"
                  name="sourceHref"
                  onChange={(e) => setSourceHref(e.target.value)}
                  value={sourceHref}
                  placeholder="source URL"
                />
              </div>
              <div className={'formItem'}>
                <label>Logo URL</label>
                <input
                  type="text"
                  name="logoHref"
                  onChange={(e) => setLogoHref(e.target.value)}
                  value={logoHref}
                  placeholder="logo URL"
                />
              </div>
              <div className={'formItem'}>
                <label>Documentation URL</label>
                <input
                  type="text"
                  name="docsHref"
                  onChange={(e) => setDocsHref(e.target.value)}
                  value={docsHref}
                  placeholder="docs URL"
                />
              </div>
              <div className={'formItem'}>
                <label>Data Repository URL</label>
                <input
                  type="text"
                  name="dataRepoHref"
                  onChange={(e) => setDataRepoHref(e.target.value)}
                  value={dataRepoHref}
                  placeholder="data repo URL"
                />
              </div>
              <div className={'formItem'}>
                <label>Sports</label>
                <input
                  type="text"
                  name="sports"
                  onChange={(e) => setSports(e.target.value)}
                  value={sports}
                  placeholder="sports"
                />
              </div>
              <div className={'formItem'}>
                <label>Repository Type</label>
                <input
                  type="text"
                  name="repoType"
                  onChange={(e) => setRepoType(e.target.value)}
                  value={repoType}
                  placeholder="repository type: R, Python, Node.js, Data"
                />
              </div>
              <div className={'formItem'}>
                <label>Package Description</label>
                <textarea
                  name="content"
                  onChange={(e) => setContent(e.target.value)}
                  value={content}
                  placeholder="content"
                />
              </div>
              <div className={'formItem'}>
                <button type="submit">Add Package</button>
              </div>
            </form>
          </div>
        </div>
    </>
  )
}
