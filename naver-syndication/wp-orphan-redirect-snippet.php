// [mungge] 구 TF 슬러그 -> 재발행글 301 (naked mungge URL 404 방지)
add_action('template_redirect', function () {
    if (is_admin()) { return; }
    $uri  = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '';
    $path = trim((string) parse_url($uri, PHP_URL_PATH), '/');
    $slug = urldecode($path);
    static $map = [
        '2026-02-08-game-dev-tools-top5-2026' => 'https://mungge.com/2026-07-15-game-free-game-assets-tools-2026/',
        '2026-04-27-game-game-asset-store-deep-comparison-2026-pricing-quality-support' => 'https://mungge.com/2026-07-15-game-free-game-assets-tools-2026/',
        '2026-04-20-ai-2026-ai-automation-saas-monetization-strategy-three-practical-methods' => 'https://mungge.com/2026-07-14-ai-side-income-systems-2026-guide/',
        '2026-03-23-game-2026-game-asset-store-comparison-unity-unreal-godot-marketplace' => 'https://mungge.com/2026-07-15-game-free-game-assets-tools-2026/',
        '2026-03-09-dev-2026-dev-environment-setup-cost-analysis-free-to-professional' => 'https://mungge.com/2026-04-13-dev-2026-programming-first-language-selection-goal-based-roadmap/',
        '2026-03-01-nextjs-배포-완전-가이드-20260301' => 'https://mungge.com/2026-02-14-dev-nextjs-deployment-guide-5-methods-comparison-2026/',
        '2026-02-27-ai-ai-pair-programming-2026-developer-ai-collaboration-guide' => 'https://mungge.com/2026-07-14-ai-coding-tools-comparison-cursor-copilot-claude-2026/',
        '2026-02-27-dev-react-state-management-2026-zustand-jotai-context-practical-guide' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-27-game-2026-javascript-game-framework-comparison-guide-performance-learning-curve' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-26-ai-claude-api-integration-guide-2026-practical-development' => 'https://mungge.com/2026-07-27-ai-claude-5-context-engineering-guide-1m-token-2026/',
        '2026-02-26-review-developer-monitor-selection-criteria-2026-resolution-color-sync' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-25-dev-typescript-migration-legacy-javascript-2026-practical-guide' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-24-ai-ai-image-generation-tools-practical-guide-2026-quality-speed-cost' => 'https://mungge.com/2026-07-06-game-ai-game-asset-tools-comparison-2026-midjourney-scenario-layer/',
        '2026-02-24-review-developer-monitor-selection-guide-2026-budget-purpose' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-23-ai-chatgpt-data-research-analysis-guide-2026' => 'https://mungge.com/2026-02-14-ai-chatgpt-usage-guide-2026/',
        '2026-02-23-dev-2026-react-performance-optimization-5-techniques' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-22-game-webgl-shader-programming-mastery-2026-low-level-graphics-api' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-22-review-practical-value-laptops-2026-top-5-by-user-type' => 'https://mungge.com/2026-07-11-review-local-llm-gpu-mini-pc-2026/',
        '2026-02-21-dev-2026-developer-equipment-value-for-money-top-5' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-21-game-canvas-webgl-game-development-2026-low-level-graphics' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-21-review-portable-monitor-comparison-2026-remote-developers' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-20-dev-typescript-migration-guide-2026-step-by-step' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-20-review-developer-laptop-cpu-gpu-selection-guide-2026' => 'https://mungge.com/2026-07-11-review-local-llm-gpu-mini-pc-2026/',
        '2026-02-19-dev-react-state-management-comparison-2026-zustand-jotai-tanstack' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-19-game-pixijs-2d-game-development-guide-2026' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-18-game-web-game-monetization-strategies-2026-complete-guide' => 'https://mungge.com/2026-07-13-game-revenue-comparison-2026-steam-mobile-web/',
        '2026-02-17-game-indie-web-game-success-stories-2026' => 'https://mungge.com/2026-07-11-game-indie-first-game-sales-reality-2026-median-wishlist-data/',
        '2026-02-16-review-best-value-laptops-2026-top-5' => 'https://mungge.com/2026-07-11-review-local-llm-gpu-mini-pc-2026/',
        '2026-02-15-dev-react-server-components-guide-2026' => 'https://mungge.com/2026-07-11-dev-frontend-trends-2026-rsc-react-compiler-typescript/',
        '2026-02-15-game-web-game-optimization-techniques-2026' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-14-game-canvas-webgl-game-development-2026' => 'https://mungge.com/2026-07-23-game-phaser-3-advanced-collision-physics-animation-2026/',
        '2026-02-14-game-cocos-creator-2026-cross-platform-game-development' => 'https://mungge.com/2026-02-07-game-engine-comparison-2026/',
        '2026-02-14-review-developer-monitor-buying-guide-2026' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-13-2026년-최고의-태블릿-추천-가성비성능용도별-완벽-비교' => 'https://mungge.com/2026-07-22-review-galaxy-z-fold8-vs-flip8-2026/',
        '2026-02-13-개발자-생산성-완전-가이드-20260213' => 'https://mungge.com/2026-07-31-ai-ai-coding-productivity-real-numbers-2026/',
        '2026-02-13-프로그래밍-입문-2026-초보자를-위한-완벽한-시작-가이드' => 'https://mungge.com/2026-04-13-dev-2026-programming-first-language-selection-goal-based-roadmap/',
        '2026-02-12-ai-image-generation-tools-comparison-2026' => 'https://mungge.com/2026-07-06-game-ai-game-asset-tools-comparison-2026-midjourney-scenario-layer/',
        '2026-02-10-2026년-최신-코딩-모니터-비교-개발자-필수-선택-가이드' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-09-best-portable-monitor-for-developers-2026' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-09-typescript-vs-rust-vs-go-backend-comparison-2026' => 'https://mungge.com/2026-04-13-dev-2026-programming-first-language-selection-goal-based-roadmap/',
        '2026-02-08-2026년-게이밍-키보드-추천-top-7-기계식-vs-자석축-완벽-비교' => 'https://mungge.com/2026-07-14-review-mechanical-keyboard-recommendation-2026/',
        '2026-02-08-chatgpt-vs-claude-ai-assistant-comparison-2026' => 'https://mungge.com/2026-07-11-ai-gpt-5-6-vs-claude-fable-5-coding-showdown/',
        '2026-02-08-godot-4-indie-game-guide' => 'https://mungge.com/2026-02-07-game-engine-comparison-2026/',
        '2026-02-07-2026년-개발자-생산성-혁명-ai-페어-프로그래머와-에이전틱-워크플로우-완벽-가이드' => 'https://mungge.com/2026-07-07-ai-agentic-ai-complete-guide-2026/',
        '2026-02-07-developer-mouse-recommendation-2026' => 'https://mungge.com/2026-03-30-review-2026-wireless-keyboard-mouse-combo-ergonomic-guide-office-workers/',
        '2026-02-07-unity-beginner-guide-2026' => 'https://mungge.com/2026-02-07-game-engine-comparison-2026/',
        '2026-02-06-rest-api-design-best-practices-2026' => 'https://mungge.com/2026-02-24-dev-supabase-practical-guide-2026-realtime-auth/',
        '2026-02-05-best-monitor-for-coding-2026' => 'https://mungge.com/2026-07-12-review-desk-setup-monitor-arm-usb-c-hub-2026/',
        '2026-02-05-n8n-automation-income' => 'https://mungge.com/2026-07-14-ai-side-income-systems-2026-guide/',
        '2026-02-04-ai-image-generation-tools-comparison-2026' => 'https://mungge.com/2026-07-06-game-ai-game-asset-tools-comparison-2026-midjourney-scenario-layer/',
        '2026-02-04-developer-laptop-comparison-macbook-gram-galaxybook' => 'https://mungge.com/2026-07-11-review-local-llm-gpu-mini-pc-2026/',
        '2026-02-03-docker-beginner-guide-developer-environment' => 'https://mungge.com/2026-02-14-dev-nextjs-deployment-guide-5-methods-comparison-2026/',
    ];
    if (isset($map[$slug])) {
        wp_redirect($map[$slug], 301);
        exit;
    }
}, 0);
