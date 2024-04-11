function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function remove(ms) {
    delay(ms).then(() => {
        document.querySelector('ytd-playlist-video-renderer yt-icon-button').click();
        delay(300).then(() => {
            const menuList = Array.from(document.querySelectorAll('tp-yt-paper-listbox ytd-menu-service-item-renderer'));
            const removeItemButton = menuList.find(item => item.textContent.includes('Удалить из плейлиста'));

            if (removeItemButton) removeItemButton.click();
        })
    })
}

for(let i = 0; i < 650; i++) {
    remove(i * 1500);
}
