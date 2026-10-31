const supportedLocales = new Set(["pt", "en", "es", "fr", "ar"]);
const localeCache = new Map();
const languageSwitcher = document.getElementById("langSwitcher");
const statusMessage = document.getElementById("app-status");
const productCards = [...document.querySelectorAll(".product-text-card")];

let currentLocale = "pt";
let currentTranslations = null;
let localeRequest = 0;
let productsById = null;
let catalogRequest = null;
let productDetailsRendered = false;

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with status ${response.status}.`);
  }
  return response.json();
}

function loadLocale(locale) {
  if (!localeCache.has(locale)) {
    const request = fetchJSON(`i18n/${locale}.json`).then((translations) => {
      if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
        throw new Error(`Invalid translations file for locale "${locale}".`);
      }
      return translations;
    });
    localeCache.set(locale, request);
    request.catch(() => localeCache.delete(locale));
  }
  return localeCache.get(locale);
}

function setStatus(message = "") {
  statusMessage.textContent = message;
}

function applyTranslations(locale, translations) {
  currentLocale = locale;
  currentTranslations = translations;
  document.documentElement.lang = locale === "pt" ? "pt-BR" : locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  document.title = translations.pageTitle;
  document.querySelector('meta[name="description"]').content = translations.metaDescription;
  languageSwitcher.value = locale;

  document.querySelectorAll("[data-translate]").forEach((element) => {
    const text = translations[element.dataset.translate];
    if (typeof text === "string" && element.textContent !== text) {
      element.textContent = text;
    }
  });

  document.querySelectorAll("[data-translate-story]").forEach((element) => {
    const text = translations.aboutStory[Number(element.dataset.translateStory)];
    if (typeof text === "string" && element.textContent !== text) {
      element.textContent = text;
    }
  });

  document.querySelectorAll("[data-translate-aria]").forEach((element) => {
    const label = translations[element.dataset.translateAria];
    if (typeof label === "string" && element.getAttribute("aria-label") !== label) {
      element.setAttribute("aria-label", label);
    }
  });

  if (productsById) {
    updateProductTranslations(translations);
  }
}

async function changeLanguage(locale) {
  if (!supportedLocales.has(locale)) {
    setStatus("Idioma selecionado não suportado.");
    languageSwitcher.value = currentLocale;
    return;
  }

  if (currentTranslations && locale === currentLocale) {
    return;
  }

  const requestId = ++localeRequest;
  try {
    const translations = await loadLocale(locale);
    if (requestId !== localeRequest) {
      return;
    }
    applyTranslations(locale, translations);
    setStatus("");
  } catch (error) {
    console.error(`Não foi possível carregar as traduções de "${locale}".`, error);
    if (requestId === localeRequest) {
      languageSwitcher.value = currentLocale;
      setStatus(`Não foi possível carregar o idioma "${locale}". Tente novamente.`);
    }
  }
}

function createTextElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  element.textContent = text;
  return element;
}

function getLocalizedText(values, locale) {
  return values?.[locale] || values?.pt || "";
}

function renderProductDetails() {
  for (const card of productCards) {
    const productId = card.dataset.jsonId;
    const product = productsById.get(productId);
    if (!product) {
      throw new Error(`Product "${productId}" referenced by the page was not found.`);
    }

    const container = card.querySelector(".product-dynamic-content");
    const details = document.createElement("div");
    details.className = "product-details-box";

    const appendLocalizedDetail = (labelKey, contentKey, value) => {
      const heading = createTextElement("h4", "", currentTranslations[labelKey]);
      heading.dataset.productLabel = labelKey;
      const paragraph = createTextElement("p", "", getLocalizedText(value, currentLocale));
      paragraph.dataset.productCopy = contentKey;
      details.append(heading, paragraph);
    };

    appendLocalizedDetail("labelPhilosophy", "philosophy", product.philosophy);
    appendLocalizedDetail("labelRitual", "professional_ritual", product.professional_ritual);
    details.append(createTextElement("h4", "", currentTranslations.labelTech));
    details.lastElementChild.dataset.productLabel = "labelTech";
    details.append(createTextElement("p", "", product.active_technology));

    container.replaceChildren(details);
  }
}

function updateProductTranslations(translations) {
  for (const card of productCards) {
    const product = productsById.get(card.dataset.jsonId);
    card.querySelectorAll("[data-product-label]").forEach((element) => {
      element.textContent = translations[element.dataset.productLabel];
    });
    card.querySelector('[data-product-copy="philosophy"]').textContent =
      getLocalizedText(product.philosophy, currentLocale);
    card.querySelector('[data-product-copy="professional_ritual"]').textContent =
      getLocalizedText(product.professional_ritual, currentLocale);
  }
}

async function ensureCatalogLoaded() {
  if (!catalogRequest) {
    catalogRequest = fetchJSON("produtos.json").then((data) => {
      if (!Array.isArray(data?.brio_catalog)) {
        throw new Error("The product catalog must contain a brio_catalog array.");
      }

      const products = new Map();
      for (const product of data.brio_catalog) {
        if (!product?.id || products.has(product.id)) {
          throw new Error("The product catalog contains a missing or duplicate product ID.");
        }
        products.set(product.id, product);
      }
      return products;
    });
    catalogRequest.catch(() => {
      catalogRequest = null;
    });
  }

  try {
    if (!currentTranslations) {
      const locale = currentLocale;
      const translations = await loadLocale(locale);
      if (!currentTranslations && currentLocale === locale) {
        applyTranslations(locale, translations);
      }
    }
    productsById = await catalogRequest;
    if (!productDetailsRendered) {
      renderProductDetails();
      productDetailsRendered = true;
    }
    updateProductTranslations(currentTranslations);
    setStatus("");
    return true;
  } catch (error) {
    console.error("Não foi possível carregar o catálogo de produtos.", error);
    setStatus("Não foi possível carregar os detalhes dos produtos. Tente novamente.");
    return false;
  }
}

function switchTab(targetId) {
  const targetPage = document.getElementById(targetId);
  if (!targetPage?.classList.contains("page-content")) {
    return false;
  }

  document.querySelectorAll(".page-content").forEach((page) => {
    page.classList.toggle("active", page === targetPage);
  });
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const isActive = button.dataset.target === targetId;
    button.classList.toggle("active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (targetId === "produtos") {
    void ensureCatalogLoaded();
  }
  return true;
}

async function navigateToProduct(productId) {
  if (!switchTab("produtos") || !(await ensureCatalogLoaded())) {
    return;
  }
  requestAnimationFrame(() => {
    document.getElementById(productId)?.scrollIntoView({ behavior: "smooth" });
  });
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const navButton = target?.closest(".nav-btn");
  if (navButton) {
    const targetId = navButton.dataset.target;
    if (switchTab(targetId)) {
      document.getElementById(targetId).scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    }
    return;
  }

  const productLink = target?.closest("[data-product-target]");
  if (productLink) {
    event.preventDefault();
    void navigateToProduct(productLink.dataset.productTarget);
    return;
  }

  const filter = target?.closest(".filter-pill");
  if (filter) {
    const selected = filter.dataset.filter;
    document.querySelectorAll(".filter-pill").forEach((button) => {
      const isActive = button === filter;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
    document.querySelectorAll(".catalog-card").forEach((card) => {
      card.hidden = selected !== "all" && card.dataset.category !== selected;
    });
  }
});

languageSwitcher.addEventListener("change", (event) => {
  void changeLanguage(event.currentTarget.value);
});

const initialLocaleRequest = localeRequest;
loadLocale("pt")
  .then((translations) => {
    if (initialLocaleRequest === localeRequest) {
      applyTranslations("pt", translations);
    }
  })
  .catch((error) => {
    console.error("Não foi possível carregar as traduções iniciais.", error);
    setStatus("Não foi possível carregar as traduções. O conteúdo padrão será mantido.");
  });

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.querySelectorAll("video[autoplay]").forEach((video) => video.pause());
}