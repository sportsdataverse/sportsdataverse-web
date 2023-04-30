
const subscriptionURL = process.env.NEXT_PUBLIC_NEWSLETTER_URL || '';

export async function subscribeNewsletter(email: string) {
    const res = fetch(`${subscriptionURL}/api/v1/free`, {
        method: 'POST',
        body: JSON.stringify({
            additional_referring_pub_ids: '',
            current_referrer: '',
            current_url: `${encodeURIComponent(subscriptionURL)}`,
            email: `${encodeURIComponent(email)}`,
            first_referrer: `${encodeURIComponent('https://substack.com/')}`,
            first_url: `${encodeURIComponent(subscriptionURL)}`,
            referral_code: '',
            referring_pub_id: '',
            source: `${encodeURIComponent('cover_page')}`,
        })
    }).then((response) => response.json());
    return res;
}