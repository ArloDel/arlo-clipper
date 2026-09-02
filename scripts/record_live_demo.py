import os
import sys
import time
import shutil
import subprocess
from playwright.sync_api import sync_playwright

def record_workflow():
    base_url = "http://localhost:3000"
    youtube_url = "https://www.youtube.com/watch?v=TUPEoE5txmg"
    password = "admin123"

    frame_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'assets', 'frames')
    if os.path.exists(frame_dir):
        shutil.rmtree(frame_dir)
    os.makedirs(frame_dir, exist_ok=True)

    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    if not os.path.exists(chrome_path):
        chrome_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

    print("Launching browser with binary:", chrome_path)

    frame_count = 0

    def capture(page, repeat=1, delay=0.15):
        nonlocal frame_count
        for _ in range(repeat):
            frame_path = os.path.join(frame_dir, f"frame_{frame_count:05d}.png")
            page.screenshot(path=frame_path)
            frame_count += 1
            if delay > 0:
                time.sleep(delay)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=chrome_path,
            headless=True,
            args=["--no-sandbox", "--disable-gpu"]
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1
        )
        page = context.new_page()

        # 1. Login Page
        print("1. Navigating to Login page...")
        page.goto(f"{base_url}/login")
        time.sleep(1)
        capture(page, repeat=3, delay=0.2)

        # Type password
        print("Typing password...")
        pwd_input = page.locator('input[type="password"]')
        pwd_input.click()
        for ch in password:
            pwd_input.press_sequentially(ch, delay=80)
            capture(page, repeat=1, delay=0.08)

        capture(page, repeat=2, delay=0.15)
        page.locator('button[type="submit"]').click()
        time.sleep(1.5)

        # 2. Home Page
        print("2. Arrived at Home page...")
        capture(page, repeat=4, delay=0.2)

        # Type YouTube URL
        url_input = page.locator('input[type="url"]')
        url_input.click()
        for ch in youtube_url:
            url_input.press_sequentially(ch, delay=25)
            if frame_count % 3 == 0:
                capture(page, repeat=1, delay=0.03)

        capture(page, repeat=3, delay=0.2)

        # Open customize options
        options_btn = page.locator('button:has-text("Customize subtitle & ratio")')
        if options_btn.is_visible():
            options_btn.click()
            time.sleep(0.5)
            capture(page, repeat=3, delay=0.2)

        # Click Generate Clips
        print("3. Submitting video for analysis...")
        submit_btn = page.locator('button[type="submit"]')
        submit_btn.click()

        # 3. Editorial Loading / Processing
        print("4. Monitoring Editorial loading states...")
        start_time = time.time()
        while time.time() - start_time < 90:
            capture(page, repeat=1, delay=0.5)
            if page.locator('text=Subtitle Settings').is_visible():
                print("Editor Studio loaded successfully!")
                break
            time.sleep(1)

        capture(page, repeat=5, delay=0.2)

        # 4. Editor Studio Controls & OpenCV Face Tracking
        print("5. Interacting with Editor Studio...")
        # Change font
        font_select = page.locator('select').first
        if font_select.is_visible():
            font_select.select_option("Montserrat")
            capture(page, repeat=3, delay=0.2)

        # Change Animation
        anim_select = page.locator('select').last
        if anim_select.is_visible():
            anim_select.select_option("Pop")
            capture(page, repeat=3, delay=0.2)

        # Click Face Tracking Toggle
        print("6. Toggling Face Tracking (OpenCV)...")
        face_switch = page.locator('input[type="checkbox"]').first
        if face_switch.is_visible():
            face_switch.click()
            for _ in range(15):
                capture(page, repeat=1, delay=0.4)
                if not page.locator('text=Melacak wajah dengan OpenCV...').is_visible():
                    break

        capture(page, repeat=5, delay=0.2)

        # 5. Save to Library
        print("7. Saving to Library...")
        save_btn = page.locator('button:has-text("Save to Library")')
        if save_btn.is_visible():
            save_btn.click()

            # Wait for render & redirect to library
            start_render = time.time()
            while time.time() - start_render < 60:
                capture(page, repeat=1, delay=0.5)
                if page.url.endswith("/library"):
                    print("Redirected to Library successfully!")
                    break
                time.sleep(1)

        # 6. Library Page
        print("8. Library page preview...")
        time.sleep(2)
        capture(page, repeat=6, delay=0.25)

        browser.close()

    print(f"Captured {frame_count} frames. Compiling to animated GIF...")

    # Compile with FFmpeg
    ffmpeg = r"D:\kerji\project\node_modules\@ffmpeg-installer\win32-x64\ffmpeg.exe"
    output_gif = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'assets', 'demo-workflow.gif')
    input_pattern = os.path.join(frame_dir, 'frame_%05d.png')

    cmd = [
        ffmpeg, '-y',
        '-framerate', '3',
        '-i', input_pattern,
        '-vf', 'fps=3,scale=760:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer',
        output_gif
    ]

    subprocess.run(cmd, check=True)
    print("SUCCESS: Generated live demo GIF at:", output_gif, f"({os.path.getsize(output_gif)} bytes)")

    # Cleanup frames folder
    try:
        shutil.rmtree(frame_dir)
    except Exception:
        pass

if __name__ == '__main__':
    record_workflow()
