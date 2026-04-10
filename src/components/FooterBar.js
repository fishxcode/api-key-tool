const footerGroups = [
  {
    title: '产品',
    links: [
      { label: '平台首页', href: 'https://fishxcode.com/' },
      { label: '控制台', href: 'https://fishxcode.com/console' },
      { label: '立即注册', href: 'https://fishxcode.com/register?aff=9CTW' },
    ],
  },
  {
    title: '资源',
    links: [
      { label: '常见问题', href: 'https://doc.fishxcode.com/faq' },
      { label: '支持的模型', href: 'https://doc.fishxcode.com/models' },
      { label: '更新日志', href: 'https://doc.fishxcode.com/changelog' },
    ],
  },
  {
    title: '支持',
    links: [
      { label: 'QQ群：373865837', href: 'https://pre.fishxcode.com/qq_group.jpg' },
      { label: '微信号：fishxcode', href: 'https://pre.fishxcode.com/fishxcode_user.jpg' },
      { label: '微信群二维码', href: 'https://pre.fishxcode.com/wechat_group.jpg' },
      { label: 'QQ客服：2013571175', href: 'https://pre.fishxcode.com/qq.png' },
      { label: '联系客服邮箱', href: 'mailto:support@fishxcode.com' },
    ],
  },
];

const legalLinks = [
  { label: '用户协议', href: 'https://doc.fishxcode.com/terms' },
  { label: '隐私政策', href: 'https://doc.fishxcode.com/privacy' },
  { label: '联系我们', href: 'mailto:support@fishxcode.com' },
  { label: 'GitHub', href: 'https://github.com/fishxcode' },
];

function FooterBar() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__grid">
          <section className="site-footer__brand">
            <div className="site-footer__logoRow">
              <div className="site-footer__logo">F</div>
              <span className="site-footer__brandName">FishXCode</span>
            </div>
            <p className="site-footer__brandText">
              AI Coding 中转站
              <br />
              连接全球顶尖 AI 模型
              <br />
              让代码工作流更高效
            </p>
          </section>

          {footerGroups.map((group) => (
            <section key={group.title} className="site-footer__section">
              <h4 className="site-footer__title">{group.title}</h4>
              <ul className="site-footer__list">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <a
                      className="site-footer__link"
                      href={link.href}
                      target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                      rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer'}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="site-footer__divider" />

        <div className="site-footer__bottom">
          <div className="site-footer__copyright">
            <span>&copy; 2026 FishXCode. All rights reserved.</span>
            <span className="site-footer__dot">·</span>
            <span>当前页面：额度查询工具</span>
          </div>
          <div className="site-footer__legal">
            {legalLinks.map((link) => (
              <a
                key={link.label}
                className="site-footer__legalLink"
                href={link.href}
                target={link.href.startsWith('mailto:') ? undefined : '_blank'}
                rel={link.href.startsWith('mailto:') ? undefined : 'noreferrer'}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default FooterBar;
