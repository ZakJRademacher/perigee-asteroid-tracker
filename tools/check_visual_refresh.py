"""Check the working viewer, filters, CSV and responsive presentation."""
import argparse,csv,io,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

def main():
    p=argparse.ArgumentParser();p.add_argument('--url',default='http://127.0.0.1:8790');p.add_argument('--evidence',type=Path,required=True);p.add_argument('--workdir',type=Path,required=True);a=p.parse_args()
    out=a.evidence.resolve();out.mkdir(parents=True,exist_ok=True);scratch=a.workdir.resolve();scratch.mkdir(parents=True,exist_ok=True)
    errors=[]
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',headless=True)
        context=browser.new_context(viewport={'width':1440,'height':1050},accept_downloads=True,record_video_dir=str(scratch/'video-cache'),record_video_size={'width':1440,'height':1050})
        page=context.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(a.url);expect(page.locator('#asteroid-table tr').first).to_be_visible(timeout=40000)
        total=page.locator('#asteroid-table tr').count();assert total>0
        provenance=page.locator('#data-provenance').inner_text()
        page.wait_for_timeout(1100);page.screenshot(path=str(out/'overview.png'))
        page.locator('#mode-2d').click();expect(page.locator('#mode-2d')).to_have_attribute('aria-pressed','true')
        page.locator('.table-object').first.click();page.locator('.observatory').screenshot(path=str(out/'schematic-selected.png'))
        page.locator('#mode-3d').click();expect(page.locator('#mode-3d')).to_have_attribute('aria-pressed','true')
        page.locator('#live-clock').uncheck();page.locator('#earth-moon').click();page.wait_for_timeout(1800)
        page.locator('.observatory').screenshot(path=str(out/'viewer.png'))
        page.locator('#search').fill('no-such-object-visual-check');expect(page.locator('#asteroid-table tr')).to_have_count(0);expect(page.locator('#table-empty')).to_be_visible()
        page.locator('#reset-filters').click();expect(page.locator('#asteroid-table tr')).to_have_count(total)
        page.locator('.toggle-label').click();expect(page.locator('#pha-only')).to_be_checked();pha=page.locator('#asteroid-table tr').count();assert 0<pha<=total
        with page.expect_download() as event:page.locator('#download-btn').click()
        download=event.value;download.save_as(scratch/'filtered.csv');rows=list(csv.reader(io.StringIO((scratch/'filtered.csv').read_text(encoding='utf-8-sig'))));assert len(rows)-1==pha
        page.locator('#reset-filters').click();page.locator('#about-btn').click();expect(page.locator('#about-dialog')).to_be_visible();page.keyboard.press('Escape');expect(page.locator('#about-dialog')).not_to_be_visible()
        assert not page.evaluate('() => document.documentElement.scrollWidth > innerWidth')
        video=page.video;context.close();video.save_as(str(out/'perigee-motion.webm'))
        mobile=browser.new_context(viewport={'width':390,'height':844},reduced_motion='reduce');page=mobile.new_page();page.on('pageerror',lambda e:errors.append(str(e)));page.goto(a.url);expect(page.locator('#stat-count')).not_to_have_text('—',timeout=40000)
        assert not page.evaluate('() => document.documentElement.scrollWidth > innerWidth')
        assert page.evaluate('() => document.getAnimations().filter(a=>a.playState==="running").length')==0
        page.screenshot(path=str(out/'mobile.png'));page.locator('.observatory').screenshot(path=str(out/'mobile-viewer.png'))
        mobile.close();browser.close()
    assert not errors,errors
    result={'passed':True,'catalog_rows_observed':total,'pha_filtered_csv_rows':pha,'search_empty_state_and_reset':True,'2d_and_3d_mode_switches':True,'actual_viewer_captured':True,'about_dialog_keyboard_close':True,'mobile_390px_no_page_overflow':True,'reduced_motion_no_css_animation':True,'javascript_errors':errors,'provenance_displayed':provenance,'scope':'Observed provider data and existing calculations. Provider counts can change; this is not a fixed astronomical benchmark.'}
    (out/'visual-verification.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8');print(json.dumps(result))

if __name__=='__main__':main()
