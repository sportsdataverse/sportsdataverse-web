
<p align="center">
<img
    width=160px
    src="frontend/public/logo/logo.png"
    alt="sportsdataverse.org"
/>
</p>
<h3 align="center"><a href="https://sportsdataverse.org">SportsDataverse.org</a></h3>
<div align="center">

  ![Github stars](https://img.shields.io/github/stars/sportsdataverse/sportsdataverse-web?style=flat-square)

</div>


This is the code for the homepage of the [sportsdataverse](https://sportsdataverse.org).

Generally would describe the stack as Next.js, React.js using TypeScript.

## Tools Used

* **Framework**: [Next.js](https://nextjs.org/)

* **Styling**: [Tailwind CSS](https://tailwindcss.com/)

* **Content**: [MDX](https://github.com/mdx-js/mdx)

* **Database**: [Supabase](https://supabase.com/)

* **Animations**: [Framer Motion](https://framer.com/motion)

* **Deployment**: [Vercel](https://vercel.com)

* **Icons**: [React Icons](https://react-icons.github.io/react-icons/)

* **Plugins**: [rehype](https://github.com/rehypejs/rehype)

* **Analytics**: [Google Analytics](https://analytics.google.com/analytics/web/)

* [SWR](https://swr.vercel.app/)

* [Email.js](https://www.emailjs.com/)

* [React Toastify](https://github.com/fkhadra/react-toastify)


## Run Locally

Clone the project:

```bash
git clone https://github.com/sportsdataverse/sportsdataverse-web.git
```

Go to the project directory:

```bash
cd sportsdataverse-web/frontend
```

Install dependencies

```bash
yarn
# or
npm install
```

Start the server:

```bash
yarn build && yarn dev
# or
npm run build && npm run dev
```

After that server should be running on [localhost:3000](http://localhost:3000)

> I am using [yarn](https://yarnpkg.com/) but you can use [pnpm](https://pnpm.io/) or [npm](https://www.npmjs.com/)

> Warning: You could run into errors if you don't populate the `.env.local` with the correct values
